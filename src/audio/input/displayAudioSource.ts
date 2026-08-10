import type { P5FFT } from "../p5Sound";

// Captures a single window's audio via getDisplayMedia's windowAudio hint
// (Chrome 141+, macOS 14.2+) - the browser's own share picker lets the user
// choose which window/app to pull audio from (e.g. a native Spotify app
// window) instead of requiring a virtual loopback driver. getDisplayMedia()
// must run inside a real user gesture, so start() is only ever meant to be
// called from something like a keypress handler (see sketch.ts's "a" key),
// never automatically from setup().
export class DisplayAudioSource {
  #audioContext: AudioContext;
  #onError?: (error: unknown) => void;
  #fft?: P5FFT;
  #stream?: MediaStream;

  // onError fires when the picker is denied/cancelled (or anything else in
  // the capture setup throws) - AudioAnalysis.start() calls connect()+
  // start() synchronously and has no way to signal that failure back to
  // the caller itself, so sketch.ts needs this to know its "capture is
  // active" state is actually still off (see the "a" key handler).
  constructor(audioContext: AudioContext, onError?: (error: unknown) => void) {
    this.#audioContext = audioContext;
    this.#onError = onError;
  }

  connect(fft: P5FFT): void {
    this.#fft = fft;
  }

  // Fires off the (async, gesture-gated) capture request rather than
  // awaiting it - matches every other AudioSource's synchronous start(),
  // and lets sketch.ts fire this straight from a keydown handler.
  start(): void {
    this.#capture().catch((error: unknown) => {
      console.error("DisplayAudioSource: getDisplayMedia failed", error);
      this.#onError?.(error);
    });
  }

  stop(): void {
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = undefined;
  }

  async #capture(): Promise<void> {
    if (!this.#fft) {
      throw new Error("DisplayAudioSource.start() called before connect()");
    }

    // getDisplayMedia mandates a video track even when only audio is
    // wanted (video: false rejects outright) - stopped immediately below
    // since nothing here ever reads it. windowAudio is a Chrome-only hint
    // that scopes the share picker's audio option to just the chosen
    // window rather than the whole system; it predates this project's
    // bundled DOM types, hence the cast.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
      windowAudio: "window",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    this.#stream = stream;
    stream.getVideoTracks().forEach((track) => track.stop());

    // createMediaStreamSource() throws a bare, unhelpful InvalidStateError
    // if the picker returned a stream with no audio track at all - happens
    // when the user picks a sharing surface/browser version that doesn't
    // actually offer per-window audio, or leaves an audio checkbox
    // unchecked in the picker. Fail with an actionable message instead.
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        "Captured stream has no audio track - in the share picker, choose a " +
          "specific window (not a tab or full screen) and make sure its " +
          "'share audio' option is checked. Per-window audio capture also " +
          "needs Chrome 141+ on macOS 14.2+.",
      );
    }

    // Connect INTO fft.input rather than overwrite it - see P5FFT.input's
    // comment in p5Sound.ts for why assignment alone wouldn't route any
    // audio anywhere.
    const node = this.#audioContext.createMediaStreamSource(stream);
    node.connect(this.#fft.input);
  }
}
