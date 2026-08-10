interface EnergySample {
  timestamp: number;
  value: number;
}

// Onset detection against a trailing rolling average, rather than a level
// crossing against a fixed absolute number - a beat is a sudden *rise*
// above what's currently normal, not merely "loud right now". This also
// self-calibrates to whatever's playing (quiet passages and loud passages
// both get compared to their own recent average) instead of needing a
// fixed threshold re-tuned per track.
export class BeatDetector {
  // How far above its own recent rolling average a sample must jump to
  // register as a beat - e.g. 1.3 means "30% above the recent average".
  sensitivity: number;
  // Minimum time between two detected beats, in ms - stops one loud
  // moment (and its trailing decay, which would otherwise stay above the
  // rolling average for a while too) from registering as several beats.
  cooldown: number;
  // How far back the rolling average looks, in ms - long enough to
  // represent "normal" for the current passage, short enough to track the
  // track's own dynamics rather than smearing over minutes of history.
  historyDuration: number;
  // Absolute floor below which nothing counts as a beat, regardless of
  // how far above the rolling average it is - without this, near-silence
  // (a tiny rolling average) would make any tiny blip register as a beat.
  minEnergy: number;

  #history: EnergySample[] = [];
  #historySum = 0;
  #lastBeat = 0;
  #previousEnergy = 0;

  constructor(
    sensitivity = 1.3,
    cooldown = 200,
    historyDuration = 1000,
    minEnergy = 0.05,
  ) {
    this.sensitivity = sensitivity;
    this.cooldown = cooldown;
    this.historyDuration = historyDuration;
    this.minEnergy = minEnergy;
  }

  update(energyNorm: number): boolean {
    // Only differences between successive readings matter here, so
    // performance.now() (no p5 instance needed) works as well as p5's own
    // sketch-relative millis() would.
    const now = performance.now();

    // Evict samples older than historyDuration first, then compute this
    // call's average from what's left - *before* folding the current
    // sample in, so a spike is compared against what was normal just
    // before it, not partly against itself. Real elapsed time (not a fixed
    // sample count) drives eviction since update() runs once per drawn
    // frame, and frame rate isn't guaranteed steady.
    while (
      this.#history.length > 0 &&
      now - this.#history[0].timestamp > this.historyDuration
    ) {
      const evicted = this.#history.shift();
      if (evicted) this.#historySum -= evicted.value;
    }
    // No history yet (the very first sample ever) - fall back to treating
    // this sample as its own baseline, so it can't spuriously register as
    // a beat before any real baseline exists.
    const average =
      this.#history.length > 0
        ? this.#historySum / this.#history.length
        : energyNorm;

    this.#history.push({ timestamp: now, value: energyNorm });
    this.#historySum += energyNorm;

    // A sustained loud note can stay above average*sensitivity for as long
    // as it takes the rolling average to catch up to it (up to
    // historyDuration), which would otherwise keep re-triggering every
    // time the cooldown expires despite nothing new actually happening.
    // Requiring the signal to still be *rising* compared to the previous
    // sample catches exactly the transient rise a beat actually is, and
    // stays false through a flat or decaying plateau regardless of how the
    // average is doing.
    const isRising = energyNorm > this.#previousEnergy;
    this.#previousEnergy = energyNorm;

    const isOnset =
      isRising &&
      energyNorm > this.minEnergy &&
      energyNorm > average * this.sensitivity;

    if (isOnset && now - this.#lastBeat > this.cooldown) {
      this.#lastBeat = now;
      return true;
    }
    return false;
  }
}
