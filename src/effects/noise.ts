import type { Strand } from "../strand";
import { sigmoid } from "./sigmoid";
import { SimplexNoise } from "./perlin4d";

const noiseScaleX = 0.005;
const noiseScaleY = 0.005;
const noiseLevel = 10;
const TWO_PI = Math.PI * 2;
let z!: number;
let w!: number;
let R!: number;
let Simplex!: SimplexNoise;
const maxWarpFactor = 1.5;
const minWarpFactor = 1.0;
const warpDelay = 1 / 1000;
let warpFactor: number = 1;

export class PerlinNoise {
  #speedRadians: number;
  #angle: number;
  #warpProgress = 0;
  #fft: unknown;

  constructor(seed: number, loopTime: number, fft?: unknown) {
    Simplex = new SimplexNoise(seed ?? Math.random);

    this.#speedRadians = TWO_PI / (loopTime * 1000);
    this.#angle = 0;
    this.#fft = fft;
    R = loopTime / 25.0;
    z = 0;
    w = R;
  }

  noiseStep(flag: "Increasing" | "Decreasing", deltaTime: number): void {
    if (flag === "Increasing" && warpFactor < maxWarpFactor) {
      const current = sigmoid(this.#warpProgress);
      this.#warpProgress += deltaTime * warpDelay;
      const next = sigmoid(this.#warpProgress);
      warpFactor += next - current;
    } else if (flag === "Decreasing" && warpFactor > minWarpFactor) {
      const current = sigmoid(this.#warpProgress);
      this.#warpProgress -= deltaTime * warpDelay;
      const next = sigmoid(this.#warpProgress);
      warpFactor -= current - next;
    }

    this.#angle += this.#speedRadians * deltaTime;
    this.#angle %= TWO_PI;
    z = R * Math.cos(this.#angle);
    w = R * Math.sin(this.#angle);
  }

  noiseEffect(strand: Strand, index: number): number {
    const point = strand.pointsArray[index];

    const x = point.x * noiseScaleX;
    const y = point.y * noiseScaleY;

    const az = z * warpFactor;
    const aw = w * warpFactor;

    const noiseValue = Simplex.noise4D(x, y, az, aw);
    return (noiseLevel * noiseValue) / 2.0;
  }
}
