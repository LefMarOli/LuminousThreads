export class NormalizedValue {
  #min: number;
  #max: number;
  constructor(min = 0, max = 1) {
    this.#min = min;
    this.#max = max;
  }

  update(value: number): number {
    const t = (value - this.#min) / (this.#max - this.#min);
    return Math.min(Math.max(t, 0), 1);
  }
}
