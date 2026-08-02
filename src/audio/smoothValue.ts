export class SmoothValue {
  #smoothing: number;
  #value: number;
  constructor(smoothing = 0.1) {
    this.#value = 0;
    this.#smoothing = smoothing;
  }

  update(target: number): number {
    this.#value += (target - this.#value) * this.#smoothing;
    return this.#value;
  }
}
