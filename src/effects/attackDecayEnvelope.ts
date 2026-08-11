// Generic 0->1->0 attack/decay ramp - extracted from WindGust so the
// beat-triggered color envelope (see strandGrid.ts's #beatColorEnvelope) can
// reuse the exact same shape math independently, with its own trigger/timing
// decoupled from the wind gust's.
export class AttackDecayEnvelope {
  #duration = 3000;
  // Fraction of #duration spent on the attack (ramping up) - the rest is
  // the decay. Kept off 0/1 by the controls panel's slider bounds so the
  // divisions in step() below never see a zero-width phase.
  #attackFraction = 0.15;
  // How sharply the attack accelerates into its peak - a traditional
  // exponential growth curve, slow at first then ramping up, mirroring the
  // decay's shape (exponential, rescaled to hit its endpoint exactly) but
  // rising instead of falling. Must stay > 0 (see step() below).
  #attackSharpness = 4;
  // How sharply the decay phase initially drops before its long tail -
  // higher values feel snappier, lower values feel more gradual. Must stay
  // > 0 (see step() below).
  #decaySharpness = 4;
  // How far (in ms) into the current envelope step has advanced - only
  // meaningful while #active; reset whenever the envelope starts or finishes.
  #elapsed = 0;
  #active = false;

  setDuration(value: number): void {
    this.#duration = value;
  }

  setAttackFraction(value: number): void {
    this.#attackFraction = value;
  }

  setAttackSharpness(value: number): void {
    this.#attackSharpness = value;
  }

  setDecaySharpness(value: number): void {
    this.#decaySharpness = value;
  }

  getDuration(): number {
    return this.#duration;
  }

  getAttackFraction(): number {
    return this.#attackFraction;
  }

  getAttackSharpness(): number {
    return this.#attackSharpness;
  }

  getDecaySharpness(): number {
    return this.#decaySharpness;
  }

  isActive(): boolean {
    return this.#active;
  }

  // Starts (or restarts) the envelope from its beginning. Callers decide
  // whether restarting mid-envelope is appropriate for their trigger source
  // (e.g. StrandGrid always restarts on a beat, but guards its own ambient
  // gust timer against interrupting one already running).
  trigger(): void {
    this.#active = true;
    this.#elapsed = 0;
  }

  // Advances the clock and returns the current 0->1->0 ramp shape for this
  // frame - 0 whenever inactive (including right after finishing), so
  // callers can read it every frame with no special-casing for "idle."
  step(deltaTime: number): number {
    if (this.#active) {
      this.#elapsed += deltaTime;
      if (this.#elapsed >= this.#duration) {
        this.#active = false;
        this.#elapsed = 0;
      }
    }

    // Attack/decay splice: an exponential *growth* rise over the first
    // #attackFraction of the duration (slow at first, ramping up into the
    // peak), then an exponential *decay* over the rest (fast initial drop,
    // long trailing tail) - both rescaled (dividing out their own value at
    // the far end and renormalizing) so they land exactly on 0/1 at their
    // boundaries instead of only approaching them asymptotically.
    const progress = this.#active ? this.#elapsed / this.#duration : 0;
    if (progress <= this.#attackFraction) {
      const attackProgress = progress / this.#attackFraction;
      const raw = Math.exp(this.#attackSharpness * attackProgress) - 1;
      const peak = Math.exp(this.#attackSharpness) - 1;
      return raw / peak;
    } else {
      const decayProgress =
        (progress - this.#attackFraction) / (1 - this.#attackFraction);
      const raw = Math.exp(-this.#decaySharpness * decayProgress);
      const tail = Math.exp(-this.#decaySharpness);
      return (raw - tail) / (1 - tail);
    }
  }
}
