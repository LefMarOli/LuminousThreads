class MicAudioSource {
  constructor() {
    this.mic = new p5.AudioIn();
  }

  connect(node) {
    node.setInput(this.mic);
  }

  start() {
    this.mic.start();
  }

  stop() {
    this.mic.stop();
  }
}