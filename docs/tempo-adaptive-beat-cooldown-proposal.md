# Proposal: tempo-adaptive beat cooldown

## Status

**Implemented.** `TempoEstimator` (`src/audio/tempoEstimator.ts`), wired
into `AudioAnalysis`, with the "Beat Cooldown" slider removed and a
read-only Tempo (BPM + confidence) readout added to the Audio controls tab
in its place - as scoped below, including the hysteresis lock and range-
biased octave mitigation.

One real bug surfaced during implementation, caught by feeding the
estimator a synthetic click train at known BPMs rather than trusting it
untested: the original resampling step accumulated samples "until enough
wall-clock time has passed since the last flush," which rounds each
bucket's width up to whatever multiple of the calling cadence first clears
the target interval - at a steady 60fps caller that inflated the intended
20ms slot to ~50ms in practice, silently breaking every downstream
lag-to-time conversion (all of which assume exactly `RESAMPLE_INTERVAL_MS`
per buffer slot). Symptom: the estimator locked onto ~100 BPM regardless
of the input signal's actual tempo. Fixed by resampling onto a fixed,
epoch-anchored grid (slot index computed from elapsed time, not from
"has enough time passed since I last flushed") so each buffer slot
represents exactly `RESAMPLE_INTERVAL_MS` of real time by construction,
independent of calling cadence. Verified against synthetic 80/120/160 BPM
click trains post-fix: 120 BPM locks exactly, 80 BPM locks within one
20ms-grid quantization step, and 160 BPM demonstrates the _documented_
octave-ambiguity limitation (locks onto its half-tempo octave, since 160
sits near the search range's edge and its half is closer to the bias
center) - expected given the "basic range bias only" scope decision below,
not a bug.

## Background

[`BeatDetector`](../src/audio/beatDetector.ts) detects onsets by comparing
the current onset-strength sample (`max(bass, treble)`, computed in
[`AudioAnalysis.update()`](../src/audio/audioAnalyzer.ts)) against its own
recent rolling average, requiring a rising edge and a minimum energy floor.
A detected onset only registers as a beat if at least `cooldown`
milliseconds have passed since the last one - this refractory window is
what stops one loud transient (and its decaying tail, which would
otherwise sit above the rolling average for a while too) from registering
as several beats.

`cooldown` is currently a single fixed value (default 200ms), user-tunable
via a "Beat Cooldown" slider (0-1000ms) in the Audio controls tab
([`sketch.ts`](../src/sketch.ts)). It has no relationship to the track's
actual tempo: at 200ms it silently caps detectable tempo at 300 BPM
regardless of what's playing, and for any given fixed value there's always
some tempo it's simultaneously too loose for (double-triggering fast
material) and some tempo it's too strict for (throttling legitimately fast
beats). A cooldown derived from the track's real beat spacing would track
both ends of that trade-off instead of splitting the difference once and
leaving it.

## Proposed approach

A new `TempoEstimator` class (`src/audio/tempoEstimator.ts`), composed
inside `AudioAnalysis` alongside the existing `BeatDetector`, fed the same
onset-strength signal:

1. **Fixed-interval resampling.** Incoming per-frame samples are bucketed
   onto a ~50Hz (20ms) grid by elapsed wall-clock time
   (`performance.now()` deltas), not by call count - the same idiom
   `BeatDetector` already uses for evicting its rolling-average history,
   since frame rate isn't guaranteed steady.
2. **Rolling window.** Keeps roughly the last 6 seconds of resampled onset
   envelope.
3. **Throttled analysis.** The autocorrelation pass itself only runs every
   ~150-200ms (checked via elapsed time), not every frame - tempo doesn't
   change at frame-rate resolution, so there's no reason to pay for the
   full analysis 60 times a second.
4. **Autocorrelation over a bounded lag range**, corresponding to a
   plausible BPM range (e.g. 60-180 BPM -> ~333-1000ms lags). Computed as a
   direct sliding dot-product; the buffer and lag range are small enough
   (~300 samples, ~50-100 lags) that the FFT-based route
   (autocorrelation = inverse FFT of the power spectrum, by the
   Wiener-Khinchin theorem) isn't needed for performance, though it is the
   same family of operation as convolution under the hood.
5. **Range-biased peak search.** The peak search is weighted toward a
   "typical" center (~110 BPM) to reduce - not eliminate - octave errors
   (see below).
6. **Confidence gate.** Below a minimum peak-strength threshold, the
   estimator reports "unconfident": no BPM, no derived cooldown.
7. **Cooldown mapping.** `cooldown = lockedPeriod * fraction`, fraction
   tunable (starting guess ~0.5, so a same-beat subdivision within the
   locked period can still register while a decaying tail doesn't
   re-trigger).

### The octave-ambiguity gap

Autocorrelating a periodic onset signal doesn't produce one clean peak at
the true period `T` - it produces a comb, with comparably strong
correlation at integer multiples and divisors (`T/2`, `2T`, `3T`, ...).
This is a fundamental property of the math, not a tuning bug: a signal
periodic at `T` is, by definition, also periodic at every multiple of `T`.

It bites specifically hard here because the onset signal is
`max(bass, treble)` - kick-like content (roughly quarter-note pulse, period
`T`) blended with hi-hat/snare-like content (often eighth-note
subdivision, period `T/2`), and because four-on-the-floor kick patterns
(common in the electronic/dance material this piece is likely pointed at)
hit every quarter note with near-equal velocity, making the `2T`
"backbeat" periodicity just as strong as `T` itself. MIREX's tempo
benchmark literally scores an estimate as correct if it lands within
tolerance of `T`, `2T`, or `T/2`, because no autocorrelation-only method
reliably disambiguates which one is "the" musically intended beat.

Consequence: locking onto `T/2` halves the cooldown (subdivisions/decay
tails start re-triggering; gust rate looks doubled/jittery). Locking onto
`2T` doubles it (real beats get eaten; gusts feel sluggish). Because `T`
and its octave alternates are often close in raw correlation strength, a
naive per-window argmax can also flicker between them frame to frame with
no actual change in the source audio - visible as the reported BPM (and
cooldown) periodically jumping by 2x.

Range-biasing the peak search toward a typical center (~110 BPM) is a
partial mitigation, not a fix: it helps when the true tempo is near the
center and its octave alternates sit farther out, but actively pushes
toward the _wrong_ octave when the true tempo is near the edge of the
assumed range and its double happens to be closer to center. It also does
nothing for the frame-to-frame flicker, which is a stability problem, not
a which-octave-is-right problem.

### Hysteresis lock (addresses the flicker)

`TempoEstimator` keeps lock state - `lockedPeriod`, `lockedPeakStrength`,
`candidateStreak` - separate from the raw per-window peak-pick:

- A new candidate only overwrites the lock if it beats `lockedPeakStrength`
  by a margin (~15%, i.e. not just "any bit taller") **and** sustains that
  lead across several consecutive analysis passes (~3).
- A longer persistence override (a candidate winning consistently for
  ~2-3 seconds) bypasses the margin requirement, so a genuine tempo change
  (song transition, tempo ramp) isn't stuck locked to a stale estimate
  indefinitely - the margin/streak requirement exists to suppress
  noise-driven near-ties, not to freeze the estimate forever.

This targets the flicker specifically: two structurally near-equal peaks
(`T` vs `2T`) swapping rank on noise is exactly the case a margin+streak
requirement is sized to absorb, whereas a generic smoothing/averaging
approach would instead blend `T` and `2T` into a meaningless intermediate
value.

The exported BPM/confidence readout reflects the lock, not the raw
per-window argmax - which is also what makes it stable enough to be useful
for live tuning rather than just a flickering number.

## Architecture note: one call graph, two cadences

`TempoEstimator.update()` is called every frame from the same
`AudioAnalysis.update()` call that already drives `BeatDetector.update()` -
there's no separate timer/scheduler. "Fixed-interval resampling" and
"throttled analysis" both mean _internal_ elapsed-time checks (the same
pattern `BeatDetector` already uses for history eviction), not a second
clock competing with the draw loop. `BeatDetector`'s onset/cooldown check
still runs every frame at full frame latency, because beat detection needs
to feel immediate; `TempoEstimator`'s expensive analysis pass throttles
itself internally to ~150-200ms because tempo doesn't need frame-rate
resolution. Two cadences, one entry point.

## Changes to existing files

- **`audioAnalyzer.ts`** - owns a `TempoEstimator` alongside the existing
  `BeatDetector`; each `update()` sets `beatDetector.cooldown` from the
  estimator's output when confident, or a fixed internal fallback constant
  (not user-tunable) when not. Exposes BPM/confidence getters.
- **`beatDetector.ts`** - unchanged structurally; `cooldown` is set
  externally each frame instead of staying at its constructor default.
- **`sketch.ts`** - remove the "Beat Cooldown" slider entirely (cooldown is
  no longer a manual value); add a read-only BPM + confidence label to the
  Audio tab.

## Tunables requiring empirical tuning

Like the existing `EnergyValue` bounds (already noted in
`audioAnalyzer.ts` as needing retuning against real input), none of these
can be validated by automated tests - they need tuning against real music:
resample window length, cooldown fraction, bias center, confidence
threshold, hysteresis margin/streak-count/persistence-override duration,
and the low-confidence fallback constant.

## Implementation cost / risk

Moderate. The autocorrelation + resampling core is a self-contained,
independently testable unit (feed it a synthetic periodic signal, check it
recovers the period) before it's ever wired to real audio. The larger risk
is tuning time: getting the hysteresis parameters and bias center to
behave well across genuinely different tempos and genres is trial-and-
error against real tracks, not something resolved by more code. No
rendering-side risk - this is entirely within `src/audio/`.

## Noted for later, out of scope here

The tempo estimate currently only informs _cooldown_ (when beats are
allowed to register). The same period estimate, combined with a phase
(alignment) estimate the current design doesn't compute, could inform
detection itself - predicting the next beat's timestamp and using that to
gate/loosen the onset threshold near expected beat times, or even
synthesizing a beat when the audio goes quiet at a predicted beat time.
That's a materially bigger step (new phase-alignment machinery, and it
changes `BeatDetector`'s contract from "reactive detector with a
refractory gate" to "predictor reconciled against raw onset detection each
step," the way real beat trackers - e.g. Scheirer/Goto-style multi-agent
tracking, or Ellis's dynamic-programming beat tracker - work). Worth
returning to, deliberately excluded from this proposal's scope.

## Recommendation

Implement as scoped above (adaptive cooldown + hysteresis lock, range-
biased octave mitigation, BPM/confidence readout replacing the manual
slider). The predictive/phase-tracking direction is a legitimate follow-on
but shouldn't block landing the more contained cooldown improvement first.
