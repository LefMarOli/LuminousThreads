import p5 from "p5";
import { EnergyValue } from "./energyValue";
import { BeatDetector } from "./beatDetector";
import type { MicAudioSource } from "./input/micAudioSource";
import type { FileAudioSource } from "./input/fileAudioSource";
import type { StreamAudioSource } from "./input/streamAudioSource";

export class AudioAnalysis {
  #fft: p5.FFT;
  #bassEnergyValue: EnergyValue;
  #midEnergyValue: EnergyValue;
  #trebleEnergyValue: EnergyValue;
  #beatDetector: BeatDetector;
  #source: MicAudioSource | FileAudioSource | StreamAudioSource;

  bass: number;
  mid: number;
  treble: number;
  energy: number;
  spectrum: any[];
  waveform: any[];
  beat: boolean;

  constructor(source: MicAudioSource | FileAudioSource | StreamAudioSource) {
    this.#fft = new p5.FFT(0.9, 1024);
    this.#source = source;
    this.#bassEnergyValue = new EnergyValue(0.15, 50, 200);
    this.#midEnergyValue = new EnergyValue(0.1, 50, 200);
    this.#trebleEnergyValue = new EnergyValue(0.15, 50, 200);
    this.#beatDetector = new BeatDetector();

    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.energy = 0;
    this.spectrum = [];
    this.waveform = [];
    this.beat = false;
  }

  start(): void {
    this.#source.connect(this.#fft);
    this.#source.start();
  }

  update(): void {
    this.spectrum = this.#fft.analyze();
    this.waveform = this.#fft.waveform();

    this.bass = this.#bassEnergyValue.update(this.#fft.getEnergy("bass"));
    this.mid = this.#midEnergyValue.update(this.#fft.getEnergy("mid"));
    this.treble = this.#trebleEnergyValue.update(this.#fft.getEnergy("treble"));

    this.energy = (this.bass + this.mid + this.treble) / 3;

    this.beat = this.#beatDetector.update(this.bass);
  }
}
