class NormalizedValue {
  #min;
  #max;
  constructor(min = 0, max = 1) {
    this.#min = min;
    this.#max = max;
  }

  update(value) {
    return constrain((value - this.#min) / (this.#max - this.#min), 0, 1);
  }
}
