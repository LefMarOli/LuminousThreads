// p5.sound (the new Tone.js-based package replacing the old p5.sound addon)
// ships zero TypeScript declarations. This merges just the members this
// project actually uses into p5's own ambient global namespace/types
// (pulled in below), since there's no upstream .d.ts to align with.
/// <reference types="p5/global" />

declare namespace p5 {
  class FFT {
    constructor(fftSize?: number);
    analyzer: { getFrequencyOfIndex(index: number): number };
    analyze(): Float32Array;
    waveform(): Float32Array;
    setInput(source: unknown): void;
  }

  class AudioIn {
    constructor();
    start(): void;
    stop(): void;
  }

  class SoundFile {
    loop(): void;
    stop(): void;
  }
}

declare function loadSound(path: string): p5.SoundFile;
declare function userStartAudio(): Promise<void>;

// p5.sound ships no types (and no "types"/"exports" field at all) - this is
// a pure side-effect import, so an untyped module declaration is enough.
declare module "p5.sound";
