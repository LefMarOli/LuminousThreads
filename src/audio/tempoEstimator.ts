export interface TempoEstimate {
  bpm: number;
  periodMs: number;
  // Roughly 0-1 - the winning lag's biased, normalized autocorrelation
  // score. Not a calibrated probability, just a relative "how much better
  // supported is this than everything else" figure.
  confidence: number;
}

// How finely the onset envelope is resampled before autocorrelating -
// autocorrelation needs uniform sample spacing, and draw() frame timing
// isn't guaranteed steady, so incoming per-frame samples are bucketed onto
// this fixed grid by elapsed wall-clock time instead of by call count.
const RESAMPLE_INTERVAL_MS = 20;
// How far back the autocorrelation window looks - long enough to contain
// several repetitions of a slow tempo's period, short enough to still
// react to a tempo/track change within a few seconds.
const WINDOW_DURATION_MS = 6000;
// The autocorrelation pass itself only runs this often, not every frame -
// tempo doesn't change at frame-rate resolution, so recomputing it 60
// times/sec would be pure waste.
const ANALYSIS_INTERVAL_MS = 175;
// Search range for candidate tempos.
const MIN_BPM = 60;
const MAX_BPM = 180;
// Soft prior nudging the peak search toward a "typical" tempo, to reduce
// (not eliminate - see the tempo-adaptive-cooldown proposal doc) the
// classic autocorrelation octave-ambiguity failure mode, where a signal
// periodic at T also reads as periodic at 2T/T-over-2.
const BIAS_CENTER_BPM = 110;
const BIAS_SIGMA_BPM = 40;
// A peak must beat the search range's own mean score by this ratio, and
// clear an absolute floor, before it's trusted as a real tempo rather than
// noise with no actual periodicity.
const CONFIDENCE_RATIO_THRESHOLD = 1.3;
const MIN_PEAK_SCORE = 0.15;
// Hysteresis: a candidate that disagrees with the current lock must beat
// it by this margin...
const LOCK_SWITCH_MARGIN = 0.15;
// ...and keep beating it for this many consecutive analysis passes...
const LOCK_SWITCH_STREAK = 3;
// ...or, failing that margin+streak bar, simply keep winning for this long
// regardless - so a genuine tempo change (song transition, tempo ramp)
// isn't stuck locked to a stale estimate forever.
const LOCK_PERSISTENCE_OVERRIDE_MS = 2500;
// Relative tolerance for "this candidate is basically the same period as
// the current lock" (vs. a genuinely different, competing candidate).
const PERIOD_MATCH_TOLERANCE = 0.05;
// Drop a lock nothing confident has supported for this long - the window
// has fully turned over with no periodic signal in it, so the belief is
// stale rather than just between confident windows.
const UNLOCK_AFTER_MS = WINDOW_DURATION_MS;

interface Sample {
  timestamp: number;
  value: number;
}

interface Candidate {
  periodMs: number;
  score: number;
}

// Estimates tempo by autocorrelating the same onset-strength signal fed to
// BeatDetector, so a flat, tempo-blind cooldown can instead be derived from
// the track's actual beat spacing. See
// docs/tempo-adaptive-beat-cooldown-proposal.md for the full design
// rationale (in particular the octave-ambiguity and hysteresis sections -
// this class's bias/lock constants above only make sense in that context).
export class TempoEstimator {
  #buffer: Sample[] = [];
  // Grid anchor for resampling - the first call's timestamp defines slot 0,
  // every later slot boundary is epoch + slotIndex * RESAMPLE_INTERVAL_MS,
  // computed from elapsed time rather than call count. Without this fixed
  // anchor, accumulating "until enough time has passed since the last
  // flush" rounds each bucket's width up to whatever multiple of the
  // calling cadence first clears the target interval - at a steady 60fps
  // caller that inflates a nominal 20ms slot to ~50ms in practice, which
  // silently breaks every downstream lag-to-time conversion (they all
  // assume exactly RESAMPLE_INTERVAL_MS per slot).
  #epoch: number | null = null;
  #slotsFilled = 0;
  #pendingSum = 0;
  #pendingCount = 0;
  #lastSlotValue = 0;
  #lastAnalysisTime = 0;

  #lockedPeriodMs: number | null = null;
  #lockedScore = 0;
  #lastConfidentTime = 0;

  #opposingPeriodMs: number | null = null;
  #opposingStreak = 0;
  #opposingFirstSeenAt = 0;

  #estimate: TempoEstimate | null = null;

  get estimate(): TempoEstimate | null {
    return this.#estimate;
  }

  update(onsetSample: number): void {
    const now = performance.now();
    this.#resample(onsetSample, now);

    if (now - this.#lastAnalysisTime < ANALYSIS_INTERVAL_MS) return;
    this.#lastAnalysisTime = now;

    const candidate = this.#autocorrelate();
    this.#updateLock(candidate, now);

    this.#estimate = this.#lockedPeriodMs
      ? {
          periodMs: this.#lockedPeriodMs,
          bpm: 60000 / this.#lockedPeriodMs,
          confidence: this.#lockedScore,
        }
      : null;
  }

  #resample(onsetSample: number, now: number): void {
    if (this.#epoch === null) this.#epoch = now;
    this.#pendingSum += onsetSample;
    this.#pendingCount++;

    const targetSlots = Math.floor((now - this.#epoch) / RESAMPLE_INTERVAL_MS);
    while (this.#slotsFilled < targetSlots) {
      // A slot with no raw samples this pass (calling cadence briefly
      // slower than RESAMPLE_INTERVAL_MS) repeats the last known value
      // rather than injecting a false zero - there's no new information,
      // not evidence the signal dropped to zero.
      const value =
        this.#pendingCount > 0
          ? this.#pendingSum / this.#pendingCount
          : this.#lastSlotValue;
      this.#lastSlotValue = value;
      this.#slotsFilled++;
      this.#buffer.push({
        timestamp: this.#epoch + this.#slotsFilled * RESAMPLE_INTERVAL_MS,
        value,
      });
      this.#pendingSum = 0;
      this.#pendingCount = 0;
    }

    while (
      this.#buffer.length > 0 &&
      now - this.#buffer[0].timestamp > WINDOW_DURATION_MS
    ) {
      this.#buffer.shift();
    }
  }

  #autocorrelate(): Candidate | null {
    const minLag = Math.round(60000 / MAX_BPM / RESAMPLE_INTERVAL_MS);
    const maxLag = Math.round(60000 / MIN_BPM / RESAMPLE_INTERVAL_MS);
    const n = this.#buffer.length;
    // Need enough buffered history to compare a full period against
    // itself at the longest lag searched, not just a single copy of it.
    if (n < maxLag * 2) return null;

    const values = this.#buffer.map((s) => s.value);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const centered = values.map((v) => v - mean);
    const variance = centered.reduce((a, v) => a + v * v, 0) / n;
    // Near-silent or flat signal - nothing periodic to find, and dividing
    // by a near-zero variance below would blow up the normalization.
    if (variance < 1e-8) return null;

    let bestScore = -Infinity;
    let bestLag = minLag;
    let scoreSum = 0;
    let scoreCount = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < n - lag; i++) {
        corr += centered[i] * centered[i + lag];
      }
      const normalized = corr / ((n - lag) * variance);

      const bpm = 60000 / (lag * RESAMPLE_INTERVAL_MS);
      const bias = Math.exp(
        -((bpm - BIAS_CENTER_BPM) ** 2) / (2 * BIAS_SIGMA_BPM ** 2),
      );
      const score = normalized * bias;

      scoreSum += score;
      scoreCount++;
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    const meanScore = scoreSum / scoreCount;
    const confident =
      bestScore >= MIN_PEAK_SCORE &&
      bestScore >= meanScore * CONFIDENCE_RATIO_THRESHOLD;

    return confident
      ? { periodMs: bestLag * RESAMPLE_INTERVAL_MS, score: bestScore }
      : null;
  }

  #updateLock(candidate: Candidate | null, now: number): void {
    if (!candidate) {
      if (
        this.#lockedPeriodMs !== null &&
        now - this.#lastConfidentTime > UNLOCK_AFTER_MS
      ) {
        this.#lockedPeriodMs = null;
        this.#lockedScore = 0;
      }
      return;
    }

    this.#lastConfidentTime = now;

    if (this.#lockedPeriodMs === null) {
      this.#lockedPeriodMs = candidate.periodMs;
      this.#lockedScore = candidate.score;
      this.#opposingPeriodMs = null;
      this.#opposingStreak = 0;
      return;
    }

    const matchesLock =
      Math.abs(candidate.periodMs - this.#lockedPeriodMs) /
        this.#lockedPeriodMs <
      PERIOD_MATCH_TOLERANCE;

    if (matchesLock) {
      this.#lockedScore = candidate.score;
      this.#opposingPeriodMs = null;
      this.#opposingStreak = 0;
      return;
    }

    const matchesOpposing =
      this.#opposingPeriodMs !== null &&
      Math.abs(candidate.periodMs - this.#opposingPeriodMs) /
        this.#opposingPeriodMs <
        PERIOD_MATCH_TOLERANCE;

    if (matchesOpposing) {
      this.#opposingStreak++;
    } else {
      this.#opposingPeriodMs = candidate.periodMs;
      this.#opposingStreak = 1;
      this.#opposingFirstSeenAt = now;
    }

    const clearsMarginAndStreak =
      candidate.score >= this.#lockedScore * (1 + LOCK_SWITCH_MARGIN) &&
      this.#opposingStreak >= LOCK_SWITCH_STREAK;
    const clearsPersistence =
      now - this.#opposingFirstSeenAt >= LOCK_PERSISTENCE_OVERRIDE_MS;

    if (clearsMarginAndStreak || clearsPersistence) {
      this.#lockedPeriodMs = candidate.periodMs;
      this.#lockedScore = candidate.score;
      this.#opposingPeriodMs = null;
      this.#opposingStreak = 0;
    }
  }
}
