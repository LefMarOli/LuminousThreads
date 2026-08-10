import { Point } from "./point";
import { Strand } from "./strand";
import { NoiseLayer } from "./effects/noise";
import { WindGust } from "./effects/windGust";
import { stiffnessEffect } from "./effects/stiffness";
import { mapCoefficients } from "./bezier/bezierCurve";
import { hexToHue } from "./color/hexToHue";

export const DEFAULT_BASE_START_HUE = hexToHue("#380ef3ff");
export const DEFAULT_BASE_END_HUE = hexToHue("#db680aff");

// Deterministic per-layer seed offset - large & odd so added layers sample
// a decorrelated noise field from every other layer without needing an RNG
// (seed isn't user-exposed, it just needs to differ layer to layer).
const LAYER_SEED_STRIDE = 1013;

export interface NoiseLayerInfo {
  id: number;
  amplitude: number;
  frequency: number;
  speed: number;
}

interface NoiseLayerEntry {
  id: number;
  layer: NoiseLayer;
}

export class StrandGrid {
  numStrands: number;
  strands: Strand[];
  numPoints: number;
  #noiseLayers: NoiseLayerEntry[] = [];
  #nextLayerId = 0;
  #windGust = new WindGust();
  #loopDuration: number;
  // Only set once the corresponding slider is touched - until then, newly
  // added layers just use the constructor's own loopTime-derived radius.
  #pathRadius?: number;
  #warpProbability = 0.5;
  #warpIntervalId: ReturnType<typeof setInterval>;

  constructor(
    width: number,
    height: number,
    gapX = 20,
    baseStartHue = DEFAULT_BASE_START_HUE,
    baseEndHue = DEFAULT_BASE_END_HUE,
    margin = 10,
    numPoints = 30,
    interpolationPoints = 150,
    loopDuration = 50,
  ) {
    this.numStrands = Math.floor((width + 8 * gapX) / gapX);
    this.strands = Array(this.numStrands);

    const anchorY = height + margin;
    this.numPoints = numPoints;
    mapCoefficients(numPoints, interpolationPoints);
    const gapY = Math.ceil((anchorY - margin) / (this.numPoints - 1));
    const dataPoints: Point[] = Array(this.numPoints);
    for (let y = 0; y < this.numPoints; y++) {
      dataPoints[y] = new Point();
    }

    for (let row = 0; row < this.numStrands; row++) {
      const anchorX = -2 * margin + row * gapX;
      for (let column = 0; column < this.numPoints; column++) {
        dataPoints[column].x = anchorX;
        dataPoints[column].y = anchorY - column * gapY;
      }

      const amt = (row / this.numStrands) * 360;
      const startHue = (baseStartHue + amt) % 360;
      const endHue = (baseEndHue + amt) % 360;

      this.strands[row] = new Strand(
        dataPoints,
        interpolationPoints,
        startHue,
        endHue,
        loopDuration,
      );
    }

    this.#loopDuration = loopDuration;
    this.#addLayer(17, 0.005, 10, 1);

    // Rolls every few seconds for a chance to start a gust - skipped while
    // one's already running (see WindGust.isGustActive()/triggerGust()), so
    // this never interrupts or restarts a gust in progress.
    this.#warpIntervalId = setInterval(() => {
      if (
        !this.#windGust.isGustActive() &&
        Math.random() < this.#warpProbability
      ) {
        this.#windGust.triggerGust();
      }
    }, 3 * 1000);
  }

  #addLayer(
    seed: number,
    frequency: number,
    amplitude: number,
    speed: number,
  ): NoiseLayerInfo {
    const id = this.#nextLayerId++;
    const layer = new NoiseLayer(seed, this.#loopDuration);
    layer.setFrequency(frequency);
    layer.setNoiseLevel(amplitude);
    layer.setSpeedMultiplier(speed);
    if (this.#pathRadius !== undefined) layer.setPathRadius(this.#pathRadius);
    this.#noiseLayers.push({ id, layer });
    return { id, amplitude, frequency, speed };
  }

  // Adds a new layer at double the last layer's frequency and half its
  // amplitude - a reasonable higher-frequency-detail starting point, not a
  // fixed rule; every value is immediately tunable from its own card.
  addNoiseLayer(): NoiseLayerInfo {
    const last = this.#noiseLayers[this.#noiseLayers.length - 1]?.layer;
    const frequency = (last?.getFrequency() ?? 0.005) * 2;
    const amplitude = (last?.getNoiseLevel() ?? 10) / 2;
    const seed = 17 + this.#nextLayerId * LAYER_SEED_STRIDE;
    return this.#addLayer(seed, frequency, amplitude, 1);
  }

  removeNoiseLayer(id: number): void {
    this.#noiseLayers = this.#noiseLayers.filter((entry) => entry.id !== id);
  }

  getNoiseLayers(): NoiseLayerInfo[] {
    return this.#noiseLayers.map(({ id, layer }) => ({
      id,
      amplitude: layer.getNoiseLevel(),
      frequency: layer.getFrequency(),
      speed: layer.getSpeedMultiplier(),
    }));
  }

  setLayerAmplitude(id: number, value: number): void {
    this.#findLayer(id)?.setNoiseLevel(value);
  }

  setLayerFrequency(id: number, value: number): void {
    this.#findLayer(id)?.setFrequency(value);
  }

  setLayerSpeed(id: number, value: number): void {
    this.#findLayer(id)?.setSpeedMultiplier(value);
  }

  #findLayer(id: number): NoiseLayer | undefined {
    return this.#noiseLayers.find((entry) => entry.id === id)?.layer;
  }

  setGustIntensity(value: number): void {
    this.#windGust.setMaxWarpFactor(value);
  }

  setGustFrequency(value: number): void {
    this.#warpProbability = value;
  }

  setGustDuration(value: number): void {
    this.#windGust.setGustDuration(value);
  }

  setGustAttackFraction(value: number): void {
    this.#windGust.setGustAttackFraction(value);
  }

  setGustAttackSharpness(value: number): void {
    this.#windGust.setGustAttackSharpness(value);
  }

  setGustDecaySharpness(value: number): void {
    this.#windGust.setGustDecaySharpness(value);
  }

  // Broadcasts to every layer's own noise-space walk radius/period, rather
  // than tuning a single instance - these stay global controls (unlike
  // Amplitude/Frequency/Speed) since they weren't part of the per-layer
  // control set the layer cards expose.
  setNoiseLoopDuration(value: number): void {
    this.#loopDuration = value;
    this.#noiseLayers.forEach(({ layer }) => layer.setLoopDuration(value));
  }

  setNoisePathRadius(value: number): void {
    this.#pathRadius = value;
    this.#noiseLayers.forEach(({ layer }) => layer.setPathRadius(value));
  }

  // "Sync to Noise" tracks the first layer's rate (layer removal can never
  // drop below one layer - enforced at the UI level - so this is always
  // defined once the grid exists).
  getNoiseCurrentSpeed(): number {
    return this.#noiseLayers[0]?.layer.getCurrentSpeed() ?? 0;
  }

  // Per-strand CPU state update (mode/travel/hue) - the WebGL renderer
  // reads vertices/getVertexColor() directly, it doesn't call this itself.
  update(deltaTime: number): void {
    this.strands.forEach((strand) => strand.update(deltaTime));
  }

  move(deltaTime: number): void {
    const warp = this.#windGust.step(deltaTime);
    this.#noiseLayers.forEach(({ layer }) => {
      layer.noiseStep(deltaTime);
      layer.setWarpFactor(warp);
    });

    const effects = [
      ...this.#noiseLayers.map(({ layer }) => layer.noiseEffect),
      stiffnessEffect,
    ];
    this.strands.forEach((strand) => strand.move(effects));
  }

  // Every window resize replaces the whole StrandGrid - without this, each
  // discarded instance's interval keeps firing forever and keeps its entire
  // strand/vertex graph alive via closure, leaking on every resize.
  destroy(): void {
    clearInterval(this.#warpIntervalId);
  }
}
