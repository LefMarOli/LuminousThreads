class StreamAudioSource {
  constructor(audioContext, node) {
    this.node = node;
  }

  connect(fft) {
    fft.input = this.node;
  }

  start() {}
  stop() {}
}
