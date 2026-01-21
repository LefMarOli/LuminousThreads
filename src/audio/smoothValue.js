class SmoothValue {
  #smoothing;
  #value
  constructor(smoothing = 0.1) {
    this.#value = 0;
    this.#smoothing = smoothing;
  }

  update(target) {
    this.#value = lerp(this.#value, target, this.#smoothing);
    return this.#value;
  }
}
