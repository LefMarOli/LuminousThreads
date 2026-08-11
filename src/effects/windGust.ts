import { AttackDecayEnvelope } from "./attackDecayEnvelope";

const minWarpFactor = 1.0;

// A single shared gust controller, driving one warpFactor value per frame
// that StrandGrid broadcasts to every active NoiseLayer (see
// NoiseLayer.setWarpFactor) - a gust of wind moves the whole composite
// noise field at once, rather than being a property of any one layer.
export class WindGust {
  #maxWarpFactor = 1.5;
  #envelope = new AttackDecayEnvelope();
  // Cached from the last step() call so getEnvelopeValue() can be read by
  // other callers (e.g. the beat-triggered color effect's "React to Gust"
  // option, see strandGrid.ts) without advancing the clock a second time.
  #lastEnvelopeValue = 0;

  setMaxWarpFactor(value: number): void {
    this.#maxWarpFactor = value;
  }

  setGustDuration(value: number): void {
    this.#envelope.setDuration(value);
  }

  setGustAttackFraction(value: number): void {
    this.#envelope.setAttackFraction(value);
  }

  setGustAttackSharpness(value: number): void {
    this.#envelope.setAttackSharpness(value);
  }

  setGustDecaySharpness(value: number): void {
    this.#envelope.setDecaySharpness(value);
  }

  // Live shape config, read by the beat-triggered color envelope's own
  // "Sync to Gust" option (see strandGrid.ts) to mirror+drive its four
  // shape sliders from whatever this gust is actually configured with.
  getGustDuration(): number {
    return this.#envelope.getDuration();
  }

  getGustAttackFraction(): number {
    return this.#envelope.getAttackFraction();
  }

  getGustAttackSharpness(): number {
    return this.#envelope.getAttackSharpness();
  }

  getGustDecaySharpness(): number {
    return this.#envelope.getDecaySharpness();
  }

  isGustActive(): boolean {
    return this.#envelope.isActive();
  }

  // Starts a gust from its beginning - StrandGrid's roll check only calls
  // this while !isGustActive(), so it never interrupts/restarts one already
  // in progress via the ambient timer; a beat always restarts regardless
  // (see StrandGrid.triggerGust()).
  triggerGust(): void {
    this.#envelope.trigger();
  }

  // This gust's own raw 0->1->0 ramp shape, independent of #maxWarpFactor's
  // scaling - read by the beat-triggered color effect's "React to Gust"
  // option so it can pulse in lockstep with the wind warp without needing
  // its own separate trigger/timing.
  getEnvelopeValue(): number {
    return this.#lastEnvelopeValue;
  }

  // Advances the gust clock and returns the current warpFactor for this
  // frame. Runs on raw deltaTime - now that gust is shared across layers
  // that can each have a different Speed, there's no single layer's speed
  // left to gate this clock on (previously, freezing Noise Speed also froze
  // the gust; that coupling is gone).
  step(deltaTime: number): number {
    this.#lastEnvelopeValue = this.#envelope.step(deltaTime);
    return (
      minWarpFactor +
      (this.#maxWarpFactor - minWarpFactor) * this.#lastEnvelopeValue
    );
  }
}
