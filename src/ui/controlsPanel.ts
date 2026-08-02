export interface SliderConfig {
  label: string;
  min: number;
  max: number;
  step: number;
  initialValue: number;
  onChange: (value: number) => void;
  // Readout precision - defaults to 2. Parameters whose whole useful range
  // sits below 0.01 (e.g. a 0.0001-0.0015 spring coefficient) need more, or
  // toFixed(2) rounds every value in range to the same "0.00".
  decimals?: number;
  // Shown via a small hoverable info icon next to the label, using the
  // browser's native title tooltip rather than a custom-positioned one -
  // this project's own "minimal DOM, no extra machinery" pattern.
  description?: string;
}

// Generic toggleable panel of labeled sliders - deliberately knows nothing
// about what any individual slider controls (that mapping lives with each
// caller's onChange), so adding the next parameter is just another
// addSlider() call, not a redesign.
export class ControlsPanel {
  #container: HTMLDivElement;
  #visible = false;

  constructor() {
    this.#container = document.createElement("div");
    this.#container.id = "controls-panel";
    document.body.appendChild(this.#container);
  }

  addGroup(title: string): void {
    const heading = document.createElement("div");
    heading.className = "controls-panel__group-title";
    heading.textContent = title;
    this.#container.appendChild(heading);
  }

  addSlider(config: SliderConfig): void {
    const row = document.createElement("label");
    row.className = "controls-panel__row";

    const labelText = document.createElement("span");
    labelText.className = "controls-panel__label";
    labelText.textContent = config.label;

    if (config.description) {
      const info = document.createElement("span");
      info.className = "controls-panel__info";
      info.textContent = "ⓘ"; // circled "i"
      info.title = config.description;
      labelText.append(" ", info);
    }

    const decimals = config.decimals ?? 2;

    const valueText = document.createElement("span");
    valueText.className = "controls-panel__value";
    valueText.textContent = config.initialValue.toFixed(decimals);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(config.min);
    input.max = String(config.max);
    input.step = String(config.step);
    input.value = String(config.initialValue);
    input.addEventListener("input", () => {
      const value = Number(input.value);
      valueText.textContent = value.toFixed(decimals);
      config.onChange(value);
    });

    const labelRow = document.createElement("div");
    labelRow.className = "controls-panel__label-row";
    labelRow.append(labelText, valueText);

    row.append(labelRow, input);
    this.#container.appendChild(row);
  }

  toggle(): void {
    this.#visible = !this.#visible;
    this.#container.classList.toggle("visible", this.#visible);
  }
}
