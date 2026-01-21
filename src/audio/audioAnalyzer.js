class AudioAnalysis {
  #fft;
  #bassEnergyValue;
  #midEnergyValue;
  #trebleEnergyValue;
  #beatDetector;
  #source;

  constructor(source) {
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

  start() {
    this.#source.connect(this.#fft);
    this.#source.start();
  }

  update() {
    this.spectrum = this.#fft.analyze();
    this.waveform = this.#fft.waveform();

    this.bass = this.#bassEnergyValue.update(this.#fft.getEnergy("bass"));
    this.mid = this.#midEnergyValue.update(this.#fft.getEnergy("mid"));
    this.treble = this.#trebleEnergyValue.update(this.#fft.getEnergy("treble"));

    this.energy = (this.bass + this.mid + this.treble) / 3;

    this.beat = this.#beatDetector.update(this.bass);
  }
}
