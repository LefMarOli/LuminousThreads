import p5 from "p5";

export class MicAudioSource {
  mic: p5.AudioIn;

  constructor() {
    this.mic = new p5.AudioIn();
  }

  connect(node: p5.FFT): void {
    node.setInput(this.mic);
  }

  start(): void {
    this.mic.start();
  }

  stop(): void {
    this.mic.stop();
  }
}
