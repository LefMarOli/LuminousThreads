# Proposal: distance-based brightness + beat-synced color envelope

## Status

**Proposed.** Not yet implemented.

## Background

Two independent but related asks:

1. A new visual effect: accentuate a vertex's color intensity based on how
   far it has swayed from its strand's own rest position (`initX`), with
   the option to have that boost pulse on the beat rather than sit static.
2. Along the way, a real regression was found: `Strand#highlightFactor`
   (the _existing_ "brighter near center" highlight) was effectively
   silenced by damping added during the WebGL port (see `#highlightFactor`
   in `src/strand.ts`) to tame a singularity at full per-vertex resolution.
   The damping (`0.2`) squashed the effect to a ~0.93x-1.2x swing -
   invisible in practice. Restoring it is now part of this proposal,
   exposed as a live-tunable slider instead of a hardcoded constant.

A third, smaller item was folded in during planning: the existing
treble -> Strand Width audio binding
(`src/sketch.ts`, `setAudioReactive`/`p.draw`) isn't producing a good
result and its automatic disabling of the Strand Width slider currently
removes manual control any time audio capture is active. This proposal
decouples it behind an opt-in toggle (default off) so manual control
comes back now; revisiting the effect itself is out of scope here.

## Design

### "Center" and distance

"Center" means each strand's own rest x-position (`initX`), the same
quantity `#highlightFactor` already measures against. There is no
canvas/screen-center concept introduced - motion is per-strand lateral
sway around a fixed anchor, so that's the natural reference point, and it
lets the new effect reuse `#highlightFactor`'s existing math instead of
introducing a second, competing "center" concept.

### Two highlight modes, independently toggleable

Rather than a strict either/or mode switch, both are separate opt-in
toggles - consistent with existing controls (Sync to Noise, Proportional
Color Mode), and nothing stops running both at once if the combined look
(brighter at both extremes, dimmer mid-sway) is wanted:

- **Near-Center Highlight** (restored) - `#highlightFactor`'s existing
  `1/distance^(1/9)` shape, singularity-clamped as today. The damping
  constant becomes a live slider. Ships at a conservative default (close
  to today's near-invisible value) rather than snapping back to full
  strength, so nothing changes on reload - tune it up by eye.
- **Far-Center Boost** (new) - opposite direction, linearly saturating
  instead of diverging: `1 + farBoostStrength * min(distance / farBoostRange, 1) * envelope`,
  where `envelope` is 0 between triggers and rides an attack/decay pulse
  when triggered (see below). No singularity guard needed since it never
  diverges.

Both are combined **additively** as "excess over 1" before the existing
100-brightness clamp (`nearExcess + farExcess`, not multiplied together) -
multiplying two independently-tunable boosts risked compounding into a
flat, clipped look when both are pushed high at once; additive combination
is inherently bounded by each term's own bound.

### Master Brightness

A new global multiplier (0-100%, default 100%, manual only - no
audio-reactive auto-lowering) applied before the final clamp. This is the
"reduce overall brightness" ask: pulling it down creates headroom so a
beat-triggered Far-Center Boost pulse reads as a visible brightening
instead of instantly hitting the existing ceiling.

### Beat/gust envelope, decoupled trigger sources

Far-Center Boost's `envelope` value can come from two independent,
opt-in sources, combined via `max()` (not summed - avoids double-firing
if both happen to trigger from the same beat):

- **React to Gust** - reuses the existing `WindGust`'s own attack/decay
  ramp (`rampShape`, currently computed internally but not exposed) as
  the driving envelope. `WindGust` is shared between ambient random gusts
  and beat-triggered gusts, so with this enabled the boost fires on
  whichever of those is currently active - which also means it's
  previewable without audio (ambient gusts still fire on their own timer
  when audio capture is off).
- **React to Beat** - an independent envelope, triggered directly by
  `audioAnalyzer.beat`, fully decoupled from `WindGust`'s own
  active/elapsed state (so it still fires even if gust-triggering is
  turned off entirely - see below). Same unconditional-restart semantics
  as the recent "let beat-triggered gusts restart mid-gust" fix: a beat
  arriving mid-decay restarts the envelope from 0 rather than being
  dropped or queued.

The beat envelope's shape (attack fraction, attack sharpness, decay
sharpness, duration) gets its **own independent sliders**, separate from
the Gust tab's equivalents - plus a **Sync to Gust** toggle (default off)
that, when on, disables those 4 sliders and mirrors + functionally drives
them from the live Gust tab values instead (same disable+mirror
convention as the existing Color Speed/"Sync to Noise" toggle).

### Trigger Gust on Beat becomes optional

Today, `audioAnalyzer.beat` unconditionally calls `strandGrid.triggerGust()`
(`src/sketch.ts`). This becomes a toggle (default **on**, preserving
current behavior) so gust-triggering and beat-color-triggering can be
fully decoupled - e.g. music can drive color without driving wind motion,
or vice versa.

### Strand Width / audio decoupling

New **React to Treble** toggle (default **off**), placed next to the
Strand Width slider in the Rendering tab. `setAudioReactive()` currently
disables that slider and hands it to a treble-driven computation any time
audio capture is active, with no way to opt out. This toggle gates that
behavior specifically (Gust Frequency / the random-gust timer are
unaffected and keep their existing behavior) - defaulting to off restores
manual control now; flipping it on later revisits the effect.

## Scope of new controls

**Gust sub-tab (Motion):**

- Trigger Gust on Beat (toggle, default on)

**Rendering tab:**

- React to Treble (toggle, default off)

**Color tab (top level):**

- Near-Center Highlight Strength (slider, conservative default)
- Master Brightness (slider, default 100%)

**Color -> Far-Center Boost (new sub-tab):**

- React to Gust / React to Beat (toggles, default off, combined via `max()`)
- Strength, Range (sliders)
- Attack Fraction, Attack Sharpness, Decay Sharpness, Duration (sliders,
  independent shape, default values matching today's Gust defaults as a
  starting point)
- Sync to Gust (toggle, default off)

## Implementation plan

- `src/effects/windGust.ts` - extract the attack/decay ramp math out of
  `step()` into a reusable `AttackDecayEnvelope` helper (config: attack
  fraction/sharpness, decay sharpness, duration; methods: `trigger()`,
  `step(deltaTime): number` returning the 0->1->0 ramp shape, decoupled
  from `WindGust`'s own warp-factor scaling). Add a getter exposing the
  current ramp value.
- `src/strandGrid.ts` - new `#beatColorEnvelope` (second
  `AttackDecayEnvelope` instance), `triggerBeatColorEnvelope()` (called
  unconditionally on every beat, independent of gust-triggering),
  `getBeatEnvelope()`, setters for its shape params, and sync-to-gust
  plumbing (reads `WindGust`'s live shape config instead of its own when
  enabled).
- `src/strand.ts` - new module-level knobs following the existing
  `let` + exported-setter pattern (`highlightDamping`, `farBoostStrength`,
  `farBoostRange`, `masterBrightness`, plus a per-frame `setBeatEnvelope`
  setter); `getVertexColor`'s brightness formula becomes
  `masterBrightness * (1 + nearExcess + farExcess) * segmentBrightness`,
  clamped to 100 as today.
- `src/sketch.ts` - gate beat -> gust and treble -> width behind their new
  toggles; wire all new sliders/toggles into the Color and Rendering tabs
  and the new Far-Center Boost sub-tab; feed `max(gustEnvelope,
beatEnvelope)` into `strand.ts`'s `setBeatEnvelope` each frame, ordered
  after `strandGrid.move()` so it reflects the current frame's value with
  no lag.

## Open assumptions (flag if wrong)

- Far-Center Boost's distance normalization (`farBoostRange`) defaults to
  ~40, matching `displacementColorRange`'s existing default magnitude, but
  is a separate, independent knob - not reusing `displacementColorRange`
  itself, since that only applies in Proportional color mode while this
  should work regardless of color mode.
- The beat-color envelope's default shape values match today's Gust
  defaults (attack fraction 0.15, attack/decay sharpness 4) purely as a
  reasonable starting point, not because they're meant to move in lockstep
  going forward.
