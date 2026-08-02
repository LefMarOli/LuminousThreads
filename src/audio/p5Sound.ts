import p5 from "p5";

// p5.sound (the Tone.js-based package replacing the old p5.sound addon)
// ships zero TypeScript declarations, and attaches FFT/AudioIn/loadSound/
// userStartAudio onto the real p5 class/prototype only at runtime (once the
// addon's side-effect import runs) - there's nothing for `import p5 from
// "p5"` to see statically. A `declare module "p5" { ... }` augmentation
// can't fix this either: p5's own types export the class as `export default
// p5`, and TS module augmentation merges by *exported* name, so it can only
// ever patch a real named export - never a default export, even though the
// class's own internal declaration happens to be named "p5" too. These
// small typed wrappers are the one place that casts through the addon's
// real (untyped) runtime shape, so every caller elsewhere gets a plain
// typed interface instead of its own ambient-global assumption.

export interface P5FFT {
  analyzer: { getFrequencyOfIndex(index: number): number };
  analyze(): Float32Array;
  waveform(): Float32Array;
  setInput(source: unknown): void;
}

export interface P5AudioIn {
  start(): void;
  stop(): void;
}

export interface P5SoundFile {
  loop(): void;
  stop(): void;
}

export function createFFT(fftSize?: number): P5FFT {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (p5 as any).FFT(fftSize);
}

export function createAudioIn(): P5AudioIn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (p5 as any).AudioIn();
}

export function loadSound(p: p5, path: string): P5SoundFile {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (p as any).loadSound(path);
}

export function userStartAudio(p: p5): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (p as any).userStartAudio();
}
