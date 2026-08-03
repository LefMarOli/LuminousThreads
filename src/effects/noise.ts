import type { Strand } from "../strand";
import { SimplexNoise } from "./perlin4d";

const TWO_PI = Math.PI * 2;
let z!: number;
let w!: number;
let R!: number;
let Simplex!: SimplexNoise;
const minWarpFactor = 1.0;
let warpFactor: number = 1;

export class PerlinNoise {
  #speedRadians: number;
  #angle: number;
  #fft: unknown;
  #noiseLevel = 10;
  #maxWarpFactor = 1.5;
  #noiseScaleX = 0.005;
  #noiseScaleY = 0.005;
  #speedMultiplier = 1;
  #gustDuration = 3000;
  // How far (in ms) into the current gust noiseStep has advanced - only
  // meaningful while #gustActive; reset whenever a gust starts or finishes.
  #gustElapsed = 0;
  #gustActive = false;
  // Fraction of #gustDuration spent on the attack (ramping up) - the rest is
  // the decay. Kept off 0/1 by the controls panel's slider bounds so the
  // divisions in noiseStep below never see a zero-width phase.
  #gustAttackFraction = 0.15;
  // How sharply the attack accelerates into its peak - a traditional
  // exponential growth curve, slow at first then ramping up, mirroring the
  // decay's shape (exponential, rescaled to hit its endpoint exactly) but
  // rising instead of falling. Must stay > 0 (see noiseStep below).
  #gustAttackSharpness = 4;
  // How sharply the decay phase initially drops before its long tail -
  // higher values feel snappier, lower values feel more gradual. Must stay
  // > 0 (see noiseStep below).
  #gustDecaySharpness = 4;

  constructor(seed: number, loopTime: number, fft?: unknown) {
    Simplex = new SimplexNoise(seed ?? Math.random);

    this.#speedRadians = TWO_PI / (loopTime * 1000);
    this.#angle = 0;
    this.#fft = fft;
    R = loopTime / 25.0;
    z = 0;
    w = R;
  }

  setNoiseLevel(value: number): void {
    this.#noiseLevel = value;
  }

  setMaxWarpFactor(value: number): void {
    this.#maxWarpFactor = value;
  }

  setWaveFrequency(value: number): void {
    this.#noiseScaleX = value;
    this.#noiseScaleY = value;
  }

  setGustDuration(value: number): void {
    this.#gustDuration = value;
  }

  setGustAttackFraction(value: number): void {
    this.#gustAttackFraction = value;
  }

  setGustAttackSharpness(value: number): void {
    this.#gustAttackSharpness = value;
  }

  setGustDecaySharpness(value: number): void {
    this.#gustDecaySharpness = value;
  }

  isGustActive(): boolean {
    return this.#gustActive;
  }

  // Starts a gust from its beginning - StrandGrid's roll check only calls
  // this while !isGustActive(), so it never interrupts/restarts one already
  // in progress.
  triggerGust(): void {
    this.#gustActive = true;
    this.#gustElapsed = 0;
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
    R = value;
  }

  // Multiplies #speedRadians below - a shared knob for how fast the noise
  // pattern itself evolves over time, independent of Wave Frequency's
  // spatial scale.
  setSpeedMultiplier(value: number): void {
    this.#speedMultiplier = value;
  }

  // The actual current rate the (az, aw) sample point is moving through the
  // noise domain - #speedMultiplier alone understates this during a gust,
  // since warpFactor scales the same rotating (z, w) vector up before it's
  // sampled (see noiseEffect below), making the domain move faster for the
  // same angular step. Polled every frame by sketch.ts's "Sync to Noise"
  // toggle so colorSpeedMultiplier (strand.ts) tracks gust bursts too, not
  // just the slider's base value.
  getCurrentSpeed(): number {
    return this.#speedMultiplier * warpFactor;
  }

  noiseStep(deltaTime: number): void {
    // Scaling deltaTime itself (rather than gating the gust clock alone)
    // freezes the gust too - without this, a gust kept animating az/aw
    // (below) via the noise domain's z/w axis even at Noise Speed 0, since
    // it used to run on its own real-time timer independent of the angle's
    // rotation.
    const scaledDeltaTime = deltaTime * this.#speedMultiplier;

    if (this.#gustActive) {
      this.#gustElapsed += scaledDeltaTime;
      if (this.#gustElapsed >= this.#gustDuration) {
        this.#gustActive = false;
        this.#gustElapsed = 0;
      }
    }

    // Attack/decay splice: an exponential *growth* rise over the first
    // #gustAttackFraction of the gust (slow at first, ramping up into the
    // peak), then an exponential *decay* over the rest (fast initial drop,
    // long trailing tail) - both rescaled (dividing out their own value at
    // the far end and renormalizing) so they land exactly on 0/1 at their
    // boundaries instead of only approaching them asymptotically.
    const gustProgress = this.#gustActive
      ? this.#gustElapsed / this.#gustDuration
      : 0;
    let rampShape: number;
    if (gustProgress <= this.#gustAttackFraction) {
      const attackProgress = gustProgress / this.#gustAttackFraction;
      const raw = Math.exp(this.#gustAttackSharpness * attackProgress) - 1;
      const peak = Math.exp(this.#gustAttackSharpness) - 1;
      rampShape = raw / peak;
    } else {
      const decayProgress =
        (gustProgress - this.#gustAttackFraction) /
        (1 - this.#gustAttackFraction);
      const raw = Math.exp(-this.#gustDecaySharpness * decayProgress);
      const tail = Math.exp(-this.#gustDecaySharpness);
      rampShape = (raw - tail) / (1 - tail);
    }
    warpFactor =
      minWarpFactor + (this.#maxWarpFactor - minWarpFactor) * rampShape;

    this.#angle += this.#speedRadians * scaledDeltaTime;
    this.#angle %= TWO_PI;
    z = R * Math.cos(this.#angle);
    w = R * Math.sin(this.#angle);
  }

  // Arrow function field, not a method - strandGrid.ts passes this around
  // as a bare callback (`strand.move([this.#perlinNoise.noiseEffect, ...])`),
  // detached from its receiver. A regular method would see `this` as
  // undefined once called that way; binding `this` lexically here keeps it
  // safe to pass around detached, now that it reads instance state
  // (#noiseLevel) instead of only module-level values.
  noiseEffect = (strand: Strand, index: number): number => {
    const point = strand.pointsArray[index];

    const x = point.x * this.#noiseScaleX;
    const y = point.y * this.#noiseScaleY;

    const az = z * warpFactor;
    const aw = w * warpFactor;

    const noiseValue = Simplex.noise4D(x, y, az, aw);
    return (this.#noiseLevel * noiseValue) / 2.0;
  };
}
