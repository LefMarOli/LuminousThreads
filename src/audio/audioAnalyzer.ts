import { EnergyValue } from "./energyValue";
import { BeatDetector } from "./beatDetector";
import type { MicAudioSource } from "./input/micAudioSource";
import type { FileAudioSource } from "./input/fileAudioSource";
import type { StreamAudioSource } from "./input/streamAudioSource";

const FFT_SIZE = 1024;

type BinRange = readonly [lowIdx: number, highIdx: number];

// p5.sound 2.x's FFT dropped getEnergy() entirely (no built-in band-energy
// helper) - this reimplements it by averaging analyze()'s bins that fall
// within a frequency range, using the same band boundaries p5.sound 1.x used
// for "bass"/"mid"/"treble". `fft.analyzer` isn't part of any documented
// public API (p5.sound ships no types at all), but it's the only way to map
// bin index -> frequency without hardcoding an assumed sample rate.
//
// The bin<->frequency mapping only depends on fftSize/sample rate, which
// never change after setup, so it's computed once here rather than on every
// call to bandEnergy() (which runs 3x per frame, once per band).
function frequencyRangeToBinRange(
  fft: p5.FFT,
  lowHz: number,
  highHz: number,
): BinRange {
  let lowIdx = 0;
  let highIdx = FFT_SIZE - 1;
  for (let i = 0; i < FFT_SIZE; i++) {
    const freq = fft.analyzer.getFrequencyOfIndex(i);
    if (freq < lowHz) lowIdx = i + 1;
    if (freq <= highHz) highIdx = i;
  }
  return [lowIdx, highIdx];
}

function bandEnergy(
  spectrum: Float32Array,
  [lowIdx, highIdx]: BinRange,
): number {
  let sum = 0;
  for (let i = lowIdx; i <= highIdx; i++) {
    sum += spectrum[i];
  }
  const count = highIdx - lowIdx + 1;
  return count > 0 ? sum / count : 0;
}

export class AudioAnalysis {
  #fft: p5.FFT;
  #bassRange: BinRange;
  #midRange: BinRange;
  #trebleRange: BinRange;
  #bassEnergyValue: EnergyValue;
  #midEnergyValue: EnergyValue;
  #trebleEnergyValue: EnergyValue;
  #beatDetector: BeatDetector;
  #source: MicAudioSource | FileAudioSource | StreamAudioSource;

  bass: number;
  mid: number;
  treble: number;
  energy: number;
  spectrum: Float32Array;
  waveform: Float32Array;
  beat: boolean;

  constructor(source: MicAudioSource | FileAudioSource | StreamAudioSource) {
    this.#fft = new p5.FFT(FFT_SIZE); // fftSize only now - the old smoothing arg is gone
    this.#bassRange = frequencyRangeToBinRange(this.#fft, 20, 140);
    this.#midRange = frequencyRangeToBinRange(this.#fft, 140, 2600);
    this.#trebleRange = frequencyRangeToBinRange(this.#fft, 2600, 16000);
    this.#source = source;
    // p5.sound 1.x's getEnergy() returned roughly 0-255; the replacement
    // bandEnergy() above averages analyze()'s 0-1 linear-amplitude bins, a
    // different scale AND a different underlying calculation - these min/max
    // bounds are a rough starting guess, not a calibrated value. Needs
    // retuning against real mic/file input (run `npm run dev` and adjust
    // until bass/mid/treble react sensibly).
    this.#bassEnergyValue = new EnergyValue(0.15, 0.02, 0.3);
    this.#midEnergyValue = new EnergyValue(0.1, 0.02, 0.3);
    this.#trebleEnergyValue = new EnergyValue(0.15, 0.02, 0.3);
    this.#beatDetector = new BeatDetector();

    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.energy = 0;
    this.spectrum = new Float32Array();
    this.waveform = new Float32Array();
    this.beat = false;
  }

  start(): void {
    this.#source.connect(this.#fft);
    this.#source.start();
  }

  update(): void {
    this.spectrum = this.#fft.analyze();
    this.waveform = this.#fft.waveform();

    this.bass = this.#bassEnergyValue.update(
      bandEnergy(this.spectrum, this.#bassRange),
    );
    this.mid = this.#midEnergyValue.update(
      bandEnergy(this.spectrum, this.#midRange),
    );
    this.treble = this.#trebleEnergyValue.update(
      bandEnergy(this.spectrum, this.#trebleRange),
    );

    this.energy = (this.bass + this.mid + this.treble) / 3;

    this.beat = this.#beatDetector.update(this.bass);
  }
}
