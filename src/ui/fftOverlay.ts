import { NormalizedValue } from "../audio/normalizedValue";

// analyze()'s raw per-bin values sit far below 1.0 for normal-loudness
// music (a linear amplitude conversion of dB levels that rarely approach
// digital full scale), so mapping them straight to bar height reads as
// "basically flat." Stretched into 0-1 the same way AudioAnalysis's bass/
// mid/treble bands already are (see audioAnalyzer.ts's EnergyValue
// calibration) - a rough starting guess, not a calibrated value; retune
// against real capture if bars still read too small/too clipped.
const SPECTRUM_MIN = 0.005;
const SPECTRUM_MAX = 0.02;

// A plain 2D <canvas> debug overlay, independent of the WebGL renderer -
// the same "no framework, just DOM" pattern ControlsPanel uses - so
// confirming FFT data is actually flowing (e.g. from DisplayAudioSource)
// never needs to touch the WebGL pipeline or its shaders.
export class FftOverlay {
  #canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D;
  #visible = false;
  // Stateless per call (just a min/max remap) - one shared instance is
  // fine to reuse across all 1024 bins every frame.
  #normalized = new NormalizedValue(SPECTRUM_MIN, SPECTRUM_MAX);

  constructor() {
    this.#canvas = document.createElement("canvas");
    this.#canvas.id = "fft-overlay";
    this.#canvas.height = 150;

    const ctx = this.#canvas.getContext("2d");
    if (!ctx) throw new Error("FftOverlay: unable to acquire 2D context");
    this.#ctx = ctx;

    this.resize(window.innerWidth);
    document.body.appendChild(this.#canvas);
  }

  resize(width: number): void {
    this.#canvas.width = width;
  }

  toggle(): void {
    this.#visible = !this.#visible;
    this.#canvas.classList.toggle("visible", this.#visible);
  }

  // spectrum: analyze()'s per-bin 0-1 linear-amplitude values (see
  // AudioAnalysis.spectrum) - drawn as one bar per bin, left-to-right low to
  // high frequency. beat flashes the overlay's border so a detected beat
  // reads at a glance instead of having to watch the bar shapes.
  draw(spectrum: Float32Array, beat: boolean): void {
    if (!this.#visible) return;

    const { width, height } = this.#canvas;
    this.#ctx.clearRect(0, 0, width, height);
    this.#ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    this.#ctx.fillRect(0, 0, width, height);

    const barWidth = width / spectrum.length;
    this.#ctx.fillStyle = "#4ade80";
    for (let i = 0; i < spectrum.length; i++) {
      const barHeight = this.#normalized.update(spectrum[i]) * height;
      this.#ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
    }

    this.#canvas.classList.toggle("fft-overlay--beat", beat);
  }
}
