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

// Generic toggleable panel of labeled sliders, grouped into tabs -
// deliberately knows nothing about what any individual slider controls
// (that mapping lives with each caller's onChange), so adding the next
// parameter is just another addSlider() call, not a redesign.
export class ControlsPanel {
  #container: HTMLDivElement;
  #tabBar: HTMLDivElement;
  #tabs: HTMLButtonElement[] = [];
  #sections: HTMLDivElement[] = [];
  #currentSection?: HTMLDivElement;
  #visible = false;

  constructor() {
    this.#container = document.createElement("div");
    this.#container.id = "controls-panel";

    this.#tabBar = document.createElement("div");
    this.#tabBar.className = "controls-panel__tabs";
    this.#container.appendChild(this.#tabBar);

    document.body.appendChild(this.#container);
  }

  addGroup(title: string): void {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "controls-panel__tab";
    tab.textContent = title;

    const section = document.createElement("div");
    section.className = "controls-panel__section";

    if (this.#sections.length === 0) {
      tab.classList.add("controls-panel__tab--active");
      section.classList.add("controls-panel__section--active");
    }

    tab.addEventListener("click", () => {
      this.#tabs.forEach((t) =>
        t.classList.remove("controls-panel__tab--active"),
      );
      this.#sections.forEach((s) =>
        s.classList.remove("controls-panel__section--active"),
      );
      tab.classList.add("controls-panel__tab--active");
      section.classList.add("controls-panel__section--active");
    });

    this.#tabBar.appendChild(tab);
    this.#container.appendChild(section);
    this.#tabs.push(tab);
    this.#sections.push(section);
    this.#currentSection = section;
  }

  addSlider(config: SliderConfig): void {
    if (!this.#currentSection)
      throw new Error("addSlider() called before any addGroup()");

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
    this.#currentSection.appendChild(row);
  }

  toggle(): void {
    this.#visible = !this.#visible;
    this.#container.classList.toggle("visible", this.#visible);
  }
}
