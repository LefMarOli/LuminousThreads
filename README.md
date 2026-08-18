# Luminous Threads

A generative art piece: a vertical "light strand" visualization rendered in
real time with WebGL2, driven by procedural motion (noise-based warping and
spring physics).

**[View it live](https://lefmaroli.github.io/LuminousThreads/)**

## Controls

- `f` — toggle fullscreen
- `w` — toggle wireframe debug overlay
- `m` — toggle the controls panel
- `g` — toggle the audio FFT debug overlay
- `a` — start/stop audio-reactive mode by capturing a shared tab/screen's audio

## Development

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build       # production build to dist/
npm run preview     # preview the production build locally
npm run typecheck
npm run lint
npm run format
```

## Stack

TypeScript, [p5.js](https://p5js.org/) v2 (used only as a canvas/context
bootstrap), and raw WebGL2, bundled with [Vite](https://vite.dev/).

## License

[MIT](LICENSE)
