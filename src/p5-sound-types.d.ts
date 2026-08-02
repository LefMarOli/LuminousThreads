// p5.sound (the Tone.js-based package replacing the old p5.sound addon)
// ships no types (and no "types"/"exports" field at all) - this is a pure
// side-effect import, so an untyped module declaration is enough to satisfy
// `await import("p5.sound")` in sketch.ts. The FFT/AudioIn/loadSound/
// userStartAudio members it attaches to the real p5 class/prototype at
// runtime are typed separately in src/audio/p5Sound.ts - see that file's
// comment for why a `declare module "p5" { ... }` augmentation can't do
// this instead.
declare module "p5.sound";
