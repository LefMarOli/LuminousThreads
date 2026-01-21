class FileAudioSource {
  constructor(path) {
    this.sound = loadSound(path);
  }

  connect(node) {
    node.setInput(this.sound);
  }

  start() {
    this.sound.loop();
  }

  stop() {
    this.sound.stop();
  }
}
