import { Point } from "./point";
import { Strand } from "./strand";
import { NoiseLayer } from "./effects/noise";
import { WindGust } from "./effects/windGust";
import { AttackDecayEnvelope } from "./effects/attackDecayEnvelope";
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
  // Independent of #windGust's own trigger/timing - "React to Beat" (see
  // strand.ts/sketch.ts) needs a beat to pulse Far-Center Boost even when
  // "Trigger Gust on Beat" is off, so this can't just read #windGust's
  // envelope. "Sync to Gust" (below) optionally mirrors #windGust's shape
  // config into this one every frame instead of using its own.
  #beatColorEnvelope = new AttackDecayEnvelope();
  #beatEnvelopeSyncToGust = false;
  #lastBeatEnvelopeValue = 0;
  #loopDuration: number;
  // Only set once the corresponding slider is touched - until then, newly
  // added layers just use the constructor's own loopTime-derived radius.
  #pathRadius?: number;
  #warpProbability = 0.5;
  #warpIntervalId?: ReturnType<typeof setInterval>;

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
    this.#startRandomGustTimer();
  }

  // Rolls every few seconds for a chance to start a gust - skips the roll
  // entirely while one's already running, so the ambient timer never
  // interrupts or restarts a gust in progress. This guard lives here
  // (rather than in triggerGust() itself) because it's specific to this
  // caller: "roll again in 3s" isn't a real event worth restarting a gust
  // for, unlike a beat (see triggerGust() below).
  #startRandomGustTimer(): void {
    this.#warpIntervalId = setInterval(() => {
      if (this.#windGust.isGustActive()) return;
      if (Math.random() < this.#warpProbability) this.triggerGust();
    }, 3 * 1000);
  }

  // Starts a gust "from the outside" - shared by the random ambient timer
  // above and audio reactivity's beat detection (see sketch.ts). Always
  // restarts from the beginning, even mid-gust: a beat is a discrete event
  // that should produce its own visible pulse, and the default Gust
  // Duration (3000ms) comfortably outlasts the ~150-500ms cooldown between
  // beats at any plausible tempo - silently dropping every beat that
  // arrives before the previous gust finishes made gusts collapse into one
  // long pulse per few seconds instead of tracking the music.
  triggerGust(): void {
    this.#windGust.triggerGust();
  }

  // Lets audio reactivity take over gust triggering (via beat detection)
  // without the random timer also firing gusts on top of it - re-enabling
  // restores the original ambient behavior.
  setRandomGustEnabled(enabled: boolean): void {
    const isEnabled = this.#warpIntervalId !== undefined;
    if (enabled === isEnabled) return;

    if (enabled) {
      this.#startRandomGustTimer();
    } else {
      clearInterval(this.#warpIntervalId);
      this.#warpIntervalId = undefined;
    }
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

  // Starts the beat-triggered color envelope "from the outside" - called
  // directly on every detected beat (see sketch.ts), independent of whether
  // that beat also triggers a wind gust (see "Trigger Gust on Beat") or
  // whether Far-Center Boost's "React to Beat" option is even enabled -
  // this always advances; strand.ts's own getVertexColor decides whether to
  // read the result (see getBeatEnvelope()). Always restarts mid-envelope,
  // same reasoning as triggerGust() above.
  triggerBeatColorEnvelope(): void {
    this.#beatColorEnvelope.trigger();
  }

  // Locks the beat-color envelope's shape to the Gust tab's own live values
  // instead of its own independent sliders - same "disable + drive" idea as
  // Color Speed's "Sync to Noise" toggle.
  setBeatEnvelopeSyncToGust(enabled: boolean): void {
    this.#beatEnvelopeSyncToGust = enabled;
  }

  setBeatEnvelopeDuration(value: number): void {
    this.#beatColorEnvelope.setDuration(value);
  }

  setBeatEnvelopeAttackFraction(value: number): void {
    this.#beatColorEnvelope.setAttackFraction(value);
  }

  setBeatEnvelopeAttackSharpness(value: number): void {
    this.#beatColorEnvelope.setAttackSharpness(value);
  }

  setBeatEnvelopeDecaySharpness(value: number): void {
    this.#beatColorEnvelope.setDecaySharpness(value);
  }

  // This gust's own current 0->1->0 ramp shape - see WindGust.getEnvelopeValue().
  getGustEnvelope(): number {
    return this.#windGust.getEnvelopeValue();
  }

  // The beat-triggered color envelope's current 0->1->0 ramp shape.
  getBeatEnvelope(): number {
    return this.#lastBeatEnvelopeValue;
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

    if (this.#beatEnvelopeSyncToGust) {
      this.#beatColorEnvelope.setDuration(this.#windGust.getGustDuration());
      this.#beatColorEnvelope.setAttackFraction(
        this.#windGust.getGustAttackFraction(),
      );
      this.#beatColorEnvelope.setAttackSharpness(
        this.#windGust.getGustAttackSharpness(),
      );
      this.#beatColorEnvelope.setDecaySharpness(
        this.#windGust.getGustDecaySharpness(),
      );
    }
    this.#lastBeatEnvelopeValue = this.#beatColorEnvelope.step(deltaTime);

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
    if (this.#warpIntervalId !== undefined) clearInterval(this.#warpIntervalId);
  }
}
