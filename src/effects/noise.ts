import type { Strand } from "../strand";
import { SimplexNoise } from "./perlin4d";

const TWO_PI = Math.PI * 2;

// One instance = one noise layer. Each owns its own Simplex field and its
// own walk through noise-space (angle/z/w/R) - these used to be module-level
// variables shared by whatever single instance existed; now that multiple
// layers can be alive at once, each layer needs its own, or every layer
// would sample the same noise field and clobber each other's walk position.
export class NoiseLayer {
  #simplex: SimplexNoise;
  #speedRadians: number;
  #angle: number;
  #R: number;
  #z: number;
  #w: number;
  #noiseLevel = 10;
  #noiseScaleX = 0.005;
  #noiseScaleY = 0.005;
  #speedMultiplier = 1;
  // The current gust warp, pushed in once per frame by StrandGrid from the
  // shared WindGust controller - gust is a single effect shared across every
  // layer now, not something each layer computes for itself.
  #warpFactor = 1;

  constructor(seed: number, loopTime: number) {
    this.#simplex = new SimplexNoise(seed ?? Math.random);
    this.#speedRadians = TWO_PI / (loopTime * 1000);
    this.#angle = 0;
    this.#R = loopTime / 25.0;
    this.#z = 0;
    this.#w = this.#R;
  }

  getNoiseLevel(): number {
    return this.#noiseLevel;
  }

  setNoiseLevel(value: number): void {
    this.#noiseLevel = value;
  }

  getFrequency(): number {
    return this.#noiseScaleX;
  }

  setFrequency(value: number): void {
    this.#noiseScaleX = value;
    this.#noiseScaleY = value;
  }

  getSpeedMultiplier(): number {
    return this.#speedMultiplier;
  }

  setSpeedMultiplier(value: number): void {
    this.#speedMultiplier = value;
  }

  setWarpFactor(value: number): void {
    this.#warpFactor = value;
  }

  // Recomputes #speedRadians for a new noise-space loop period, independent
  // of the strand-side loopDuration (Strand's own entering/exiting cycle and
  // color speed) that this constructor originally shared it with.
  setLoopDuration(value: number): void {
    this.#speedRadians = TWO_PI / (value * 1000);
  }

  // Directly overrides R (the radius of the circular path the (z, w) sample
  // point travels along) - a live-tunable counterpart to the value the
  // constructor derives once from loopTime.
  setPathRadius(value: number): void {
    this.#R = value;
  }

  // The actual current rate this layer's (az, aw) sample point is moving
  // through the noise domain - #speedMultiplier alone understates this
  // during a gust, since warpFactor scales the same rotating (z, w) vector
  // up before it's sampled (see noiseEffect below), making the domain move
  // faster for the same angular step.
  getCurrentSpeed(): number {
    return this.#speedMultiplier * this.#warpFactor;
  }

  noiseStep(deltaTime: number): void {
    const scaledDeltaTime = deltaTime * this.#speedMultiplier;
    this.#angle += this.#speedRadians * scaledDeltaTime;
    this.#angle %= TWO_PI;
    this.#z = this.#R * Math.cos(this.#angle);
    this.#w = this.#R * Math.sin(this.#angle);
  }

  // Arrow function field, not a method - strandGrid.ts passes this around
  // as a bare callback (`strand.move([...layers.map(l => l.noiseEffect), ...])`),
  // detached from its receiver. A regular method would see `this` as
  // undefined once called that way; binding `this` lexically here keeps it
  // safe to pass around detached.
  noiseEffect = (strand: Strand, index: number): number => {
    const point = strand.pointsArray[index];

    const x = point.x * this.#noiseScaleX;
    const y = point.y * this.#noiseScaleY;

    const az = this.#z * this.#warpFactor;
    const aw = this.#w * this.#warpFactor;

    const noiseValue = this.#simplex.noise4D(x, y, az, aw);
    return (this.#noiseLevel * noiseValue) / 2.0;
  };
}
