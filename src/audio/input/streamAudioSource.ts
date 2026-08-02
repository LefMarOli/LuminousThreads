import type { P5FFT } from "../p5Sound";

export class StreamAudioSource {
  node: unknown;

  constructor(audioContext: unknown, node: unknown) {
    this.node = node;
  }

  connect(fft: P5FFT): void {
    // `.input` isn't part of P5FFT's declared shape (see p5Sound.ts's comment).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fft as any).input = this.node;
  }

  start(): void {}
  stop(): void {}
}
