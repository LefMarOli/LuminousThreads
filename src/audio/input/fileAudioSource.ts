import type p5 from "p5";

export class FileAudioSource {
  sound: p5.SoundFile;

  constructor(path: string) {
    this.sound = loadSound(path);
  }

  connect(node: p5.FFT): void {
    node.setInput(this.sound);
  }

  start(): void {
    this.sound.loop();
  }

  stop(): void {
    this.sound.stop();
  }
}
