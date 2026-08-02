export interface SliderConfig {
  label: string;
  min: number;
  max: number;
  step: number;
  initialValue: number;
  onChange: (value: number) => void;
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

  addSlider(config: SliderConfig): void {
    const row = document.createElement("label");
    row.className = "controls-panel__row";

    const labelText = document.createElement("span");
    labelText.className = "controls-panel__label";
    labelText.textContent = config.label;

    const valueText = document.createElement("span");
    valueText.className = "controls-panel__value";
    valueText.textContent = config.initialValue.toFixed(2);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(config.min);
    input.max = String(config.max);
    input.step = String(config.step);
    input.value = String(config.initialValue);
    input.addEventListener("input", () => {
      const value = Number(input.value);
      valueText.textContent = value.toFixed(2);
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
