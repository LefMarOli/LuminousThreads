class EnergyValue {
  #smoothedValue;
  #normalizedValue;
  constructor(smoothing = 0.1, min, max) {
    this.#smoothedValue = new SmoothValue(smoothing);
    this.#normalizedValue = new NormalizedValue(min, max);
  }

  update(value) {
    const smoothedVal = this.#smoothedValue.update(value);
    return this.#normalizedValue.update(smoothedVal);
  }
}
