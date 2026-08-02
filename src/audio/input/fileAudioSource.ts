import type p5 from "p5";

import { loadSound, type P5FFT, type P5SoundFile } from "../p5Sound";

export class FileAudioSource {
  sound: P5SoundFile;

  constructor(p: p5, path: string) {
    this.sound = loadSound(p, path);
  }

  connect(node: P5FFT): void {
    node.setInput(this.sound);
  }

  start(): void {
    this.sound.loop();
  }

  stop(): void {
    this.sound.stop();
  }
}
