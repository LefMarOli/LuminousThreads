const minWarpFactor = 1.0;

// A single shared gust controller, driving one warpFactor value per frame
// that StrandGrid broadcasts to every active NoiseLayer (see
// NoiseLayer.setWarpFactor) - a gust of wind moves the whole composite
// noise field at once, rather than being a property of any one layer.
export class WindGust {
  #maxWarpFactor = 1.5;
  #gustDuration = 3000;
  // How far (in ms) into the current gust step has advanced - only
  // meaningful while #gustActive; reset whenever a gust starts or finishes.
  #gustElapsed = 0;
  #gustActive = false;
  // Fraction of #gustDuration spent on the attack (ramping up) - the rest is
  // the decay. Kept off 0/1 by the controls panel's slider bounds so the
  // divisions in step() below never see a zero-width phase.
  #gustAttackFraction = 0.15;
  // How sharply the attack accelerates into its peak - a traditional
  // exponential growth curve, slow at first then ramping up, mirroring the
  // decay's shape (exponential, rescaled to hit its endpoint exactly) but
  // rising instead of falling. Must stay > 0 (see step() below).
  #gustAttackSharpness = 4;
  // How sharply the decay phase initially drops before its long tail -
  // higher values feel snappier, lower values feel more gradual. Must stay
  // > 0 (see step() below).
  #gustDecaySharpness = 4;

  setMaxWarpFactor(value: number): void {
    this.#maxWarpFactor = value;
  }

  setGustDuration(value: number): void {
    this.#gustDuration = value;
  }

  setGustAttackFraction(value: number): void {
    this.#gustAttackFraction = value;
  }

  setGustAttackSharpness(value: number): void {
    this.#gustAttackSharpness = value;
  }

  setGustDecaySharpness(value: number): void {
    this.#gustDecaySharpness = value;
  }

  isGustActive(): boolean {
    return this.#gustActive;
  }

  // Starts a gust from its beginning - StrandGrid's roll check only calls
  // this while !isGustActive(), so it never interrupts/restarts one already
  // in progress.
  triggerGust(): void {
    this.#gustActive = true;
    this.#gustElapsed = 0;
  }

  // Advances the gust clock and returns the current warpFactor for this
  // frame. Runs on raw deltaTime - now that gust is shared across layers
  // that can each have a different Speed, there's no single layer's speed
  // left to gate this clock on (previously, freezing Noise Speed also froze
  // the gust; that coupling is gone).
  step(deltaTime: number): number {
    if (this.#gustActive) {
      this.#gustElapsed += deltaTime;
      if (this.#gustElapsed >= this.#gustDuration) {
        this.#gustActive = false;
        this.#gustElapsed = 0;
      }
    }

    // Attack/decay splice: an exponential *growth* rise over the first
    // #gustAttackFraction of the gust (slow at first, ramping up into the
    // peak), then an exponential *decay* over the rest (fast initial drop,
    // long trailing tail) - both rescaled (dividing out their own value at
    // the far end and renormalizing) so they land exactly on 0/1 at their
    // boundaries instead of only approaching them asymptotically.
    const gustProgress = this.#gustActive
      ? this.#gustElapsed / this.#gustDuration
      : 0;
    let rampShape: number;
    if (gustProgress <= this.#gustAttackFraction) {
      const attackProgress = gustProgress / this.#gustAttackFraction;
      const raw = Math.exp(this.#gustAttackSharpness * attackProgress) - 1;
      const peak = Math.exp(this.#gustAttackSharpness) - 1;
      rampShape = raw / peak;
    } else {
      const decayProgress =
        (gustProgress - this.#gustAttackFraction) /
        (1 - this.#gustAttackFraction);
      const raw = Math.exp(-this.#gustDecaySharpness * decayProgress);
      const tail = Math.exp(-this.#gustDecaySharpness);
      rampShape = (raw - tail) / (1 - tail);
    }

    return minWarpFactor + (this.#maxWarpFactor - minWarpFactor) * rampShape;
  }
}
