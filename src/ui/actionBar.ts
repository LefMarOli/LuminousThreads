// How long the bar stays visible after the last interaction before it fades
// back out - shared by the initial on-load reveal and every tap-triggered
// reveal thereafter.
const VISIBLE_DURATION_MS = 3000;

export interface ActionBarConfig {
  // Returns the controls panel's new visibility so this bar can mirror it
  // (active-button styling) and pin itself open while the panel is.
  onToggleMenu: () => boolean;
  onToggleFullscreen: () => void;
}

// Touch/keyboard-free entry point into the app's otherwise keyboard-only
// controls (see sketch.ts's p.keyPressed) - a small icon row that stays
// hidden until the screen is tapped, then fades back out on its own rather
// than sitting permanently on top of the artwork. Same "plain DOM,
// self-contained class" pattern as ControlsPanel/FftOverlay.
export class ActionBar {
  #container: HTMLDivElement;
  #menuButton: HTMLButtonElement;
  #hideTimer?: ReturnType<typeof setTimeout>;
  // True while the controls panel is open - suppresses auto-hide so the only
  // way to reach the panel doesn't vanish out from under an in-progress
  // slider drag.
  #pinned = false;

  constructor(config: ActionBarConfig) {
    this.#container = document.createElement("div");
    this.#container.id = "action-bar";

    this.#menuButton = document.createElement("button");
    this.#menuButton.type = "button";
    this.#menuButton.className = "action-bar__button";
    this.#menuButton.textContent = "☰";
    this.#menuButton.setAttribute("aria-label", "Toggle controls menu");
    this.#menuButton.addEventListener("click", () => {
      this.#pinned = config.onToggleMenu();
      this.#menuButton.classList.toggle(
        "action-bar__button--active",
        this.#pinned,
      );
      this.#scheduleHide();
    });
    this.#container.appendChild(this.#menuButton);

    // Fullscreen API support varies (notably absent on iOS Safari) - a dead
    // button there would be worse than no button, so it's just omitted.
    if (document.fullscreenEnabled) {
      const fullscreenButton = document.createElement("button");
      fullscreenButton.type = "button";
      fullscreenButton.className = "action-bar__button";
      fullscreenButton.textContent = "⛶";
      fullscreenButton.setAttribute("aria-label", "Toggle fullscreen");
      fullscreenButton.addEventListener("click", () => {
        config.onToggleFullscreen();
        this.#scheduleHide();
      });
      this.#container.appendChild(fullscreenButton);
    }

    document.body.appendChild(this.#container);

    // pointerdown (not click) so a tap anywhere reveals the bar even when
    // the tap's target is the canvas or the controls panel itself, not just
    // the bar's own buttons.
    window.addEventListener("pointerdown", () => this.#show());

    // Shown once on load so first-time visitors see it exists at all,
    // before it settles into pure tap-to-reveal behavior.
    this.#show();
  }

  #show(): void {
    this.#container.classList.add("action-bar--visible");
    this.#scheduleHide();
  }

  #scheduleHide(): void {
    clearTimeout(this.#hideTimer);
    if (this.#pinned) return;
    this.#hideTimer = setTimeout(() => {
      this.#container.classList.remove("action-bar--visible");
    }, VISIBLE_DURATION_MS);
  }
}
