import { SmoothValue } from "./smoothValue";
import { NormalizedValue } from "./normalizedValue";

export class EnergyValue {
  #smoothedValue: SmoothValue;
  #normalizedValue: NormalizedValue;
  constructor(smoothing = 0.1, min?: number, max?: number) {
    this.#smoothedValue = new SmoothValue(smoothing);
    this.#normalizedValue = new NormalizedValue(min, max);
  }

  update(value: number): number {
    const smoothedVal = this.#smoothedValue.update(value);
    return this.#normalizedValue.update(smoothedVal);
  }
}
