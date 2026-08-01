import type p5 from "p5";

export class StreamAudioSource {
  node: unknown;

  constructor(audioContext: unknown, node: unknown) {
    this.node = node;
  }

  connect(fft: p5.FFT): void {
    (fft as any).input = this.node;
  }

  start(): void {}
  stop(): void {}
}
