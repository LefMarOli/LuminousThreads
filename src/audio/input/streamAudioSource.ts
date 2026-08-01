export class StreamAudioSource {
  node: unknown;

  constructor(audioContext: unknown, node: unknown) {
    this.node = node;
  }

  connect(fft: p5.FFT): void {
    // `.input` isn't part of p5.FFT's declared shape (see the ambient .d.ts comment).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fft as any).input = this.node;
  }

  start(): void {}
  stop(): void {}
}
