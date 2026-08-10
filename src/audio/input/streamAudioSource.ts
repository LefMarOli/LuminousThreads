import type { P5FFT } from "../p5Sound";

export class StreamAudioSource {
  #node: AudioNode;

  constructor(node: AudioNode) {
    this.#node = node;
  }

  connect(fft: P5FFT): void {
    // Connect INTO fft.input rather than overwrite it - see P5FFT.input's
    // comment in p5Sound.ts for why assignment alone wouldn't route any
    // audio anywhere.
    this.#node.connect(fft.input);
  }

  start(): void {}
  stop(): void {}
}
