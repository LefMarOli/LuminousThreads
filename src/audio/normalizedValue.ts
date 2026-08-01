export class NormalizedValue {
  #min: number;
  #max: number;
  constructor(min = 0, max = 1) {
    this.#min = min;
    this.#max = max;
  }

  update(value: number): number {
    return constrain((value - this.#min) / (this.#max - this.#min), 0, 1);
  }
}
