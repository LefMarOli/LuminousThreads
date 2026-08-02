import { createAudioIn, type P5AudioIn, type P5FFT } from "../p5Sound";

export class MicAudioSource {
  mic: P5AudioIn;

  constructor() {
    this.mic = createAudioIn();
  }

  connect(node: P5FFT): void {
    node.setInput(this.mic);
  }

  start(): void {
    this.mic.start();
  }

  stop(): void {
    this.mic.stop();
  }
}
