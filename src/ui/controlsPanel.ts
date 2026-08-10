import { hueToHex } from "../color/hueToHex";

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
  // Small captions under the track's two ends (e.g. ["Bottom", "Top"]) -
  // for a slider whose min/max map to a named direction/state rather than a
  // number that's meaningful on its own.
  endLabels?: [string, string];
  // Treats the value as a 0-360 hue and replaces the plain numeric readout
  // with a small color swatch + hex code - for hue sliders (Start Hue/End
  // Hue) where a raw number doesn't tell you what the color actually is.
  swatch?: boolean;
}

export interface ToggleConfig {
  label: string;
  initialValue: boolean;
  onChange: (value: boolean) => void;
  // Same hoverable info icon as SliderConfig.description.
  description?: string;
}

export interface ButtonConfig {
  label: string;
  onClick: () => void;
}

// Returned by addSlider() so a caller can drive the slider programmatically -
// e.g. mirroring one slider's value onto another when a toggle links them
// (see sketch.ts's "Sync to Noise" toggle), without that caller reaching
// into the panel's DOM directly.
export interface SliderHandle {
  // Updates the input, decimals-formatted readout, and drag handle position -
  // deliberately does NOT invoke the slider's own onChange, since the caller
  // mirroring a value has already applied whatever effect it implies.
  setValue(value: number): void;
  // Disables the input and dims the row - used while a linked value is
  // being driven by something else, so it's clear this slider is inert.
  setEnabled(enabled: boolean): void;
}

export interface ButtonHandle {
  // Disables the button (e.g. "+ Add Layer" once a cap is reached).
  setEnabled(enabled: boolean): void;
}

// Returned by addGroup() and every nesting level below it (subtabs,
// removable groups) - each is just "a container that knows how to host
// controls," so the same surface works whether it's a whole tab, a subtab,
// or a single removable card.
export interface GroupHandle {
  addSlider(config: SliderConfig): SliderHandle;
  addToggle(config: ToggleConfig): void;
  addButton(config: ButtonConfig): ButtonHandle;
  // Builds a nested tab strip inside this group's own container (e.g. the
  // Motion tab's General/Noise/Gust subtabs) - one GroupHandle per title.
  addSubTabs(titles: string[]): Record<string, GroupHandle>;
  // Builds a titled, removable sub-container inside this group (the "layer
  // card" primitive) - a GroupHandle plus remove().
  addRemovableGroup(title: string): RemovableGroupHandle;
}

export interface RemovableGroupHandle extends GroupHandle {
  // Detaches this group's DOM node entirely.
  remove(): void;
}

function createSliderRow(
  container: HTMLElement,
  config: SliderConfig,
): SliderHandle {
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

  let swatchEl: HTMLSpanElement | undefined;
  let hexText: HTMLSpanElement | undefined;
  if (config.swatch) {
    valueText.classList.add("controls-panel__value--swatch");
    swatchEl = document.createElement("span");
    swatchEl.className = "controls-panel__swatch";
    hexText = document.createElement("span");
    valueText.append(swatchEl, hexText);
  }

  function renderValue(value: number): void {
    if (config.swatch && swatchEl && hexText) {
      const hex = hueToHex(value);
      swatchEl.style.backgroundColor = hex;
      hexText.textContent = hex;
    } else {
      valueText.textContent = value.toFixed(decimals);
    }
  }
  renderValue(config.initialValue);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(config.min);
  input.max = String(config.max);
  input.step = String(config.step);
  input.value = String(config.initialValue);
  input.addEventListener("input", () => {
    const value = Number(input.value);
    renderValue(value);
    config.onChange(value);
  });

  const labelRow = document.createElement("div");
  labelRow.className = "controls-panel__label-row";
  labelRow.append(labelText, valueText);

  row.append(labelRow, input);

  if (config.endLabels) {
    const endLabelsRow = document.createElement("div");
    endLabelsRow.className = "controls-panel__end-labels";
    const [minLabel, maxLabel] = config.endLabels;
    const minSpan = document.createElement("span");
    minSpan.textContent = minLabel;
    const maxSpan = document.createElement("span");
    maxSpan.textContent = maxLabel;
    endLabelsRow.append(minSpan, maxSpan);
    row.append(endLabelsRow);
  }

  container.appendChild(row);

  return {
    setValue(value) {
      input.value = String(value);
      renderValue(value);
    },
    setEnabled(enabled) {
      input.disabled = !enabled;
      row.classList.toggle("controls-panel__row--disabled", !enabled);
    },
  };
}

function createToggleRow(container: HTMLElement, config: ToggleConfig): void {
  const row = document.createElement("label");
  row.className = "controls-panel__row controls-panel__row--toggle";

  const labelText = document.createElement("span");
  labelText.className = "controls-panel__label";
  labelText.textContent = config.label;

  if (config.description) {
    const info = document.createElement("span");
    info.className = "controls-panel__info";
    info.textContent = "ⓘ";
    info.title = config.description;
    labelText.append(" ", info);
  }

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = config.initialValue;
  input.addEventListener("change", () => {
    config.onChange(input.checked);
  });

  const labelRow = document.createElement("div");
  labelRow.className = "controls-panel__label-row";
  labelRow.append(labelText, input);

  row.append(labelRow);
  container.appendChild(row);
}

function createButtonRow(
  container: HTMLElement,
  config: ButtonConfig,
): ButtonHandle {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "controls-panel__button";
  button.textContent = config.label;
  button.addEventListener("click", () => config.onClick());

  container.appendChild(button);

  return {
    setEnabled(enabled) {
      button.disabled = !enabled;
    },
  };
}

function createGroupHandle(container: HTMLElement): GroupHandle {
  return {
    addSlider: (config) => createSliderRow(container, config),
    addToggle: (config) => createToggleRow(container, config),
    addButton: (config) => createButtonRow(container, config),
    addSubTabs: (titles) => createSubTabs(container, titles),
    addRemovableGroup: (title) => createRemovableGroup(container, title),
  };
}

// A second-level tab strip nested inside a group's own container - mirrors
// ControlsPanel's top-level tab switching, just scoped one level deeper (see
// Motion's General/Noise/Gust subtabs), reusing the same createGroupHandle
// surface for each subtab's content.
function createSubTabs(
  container: HTMLElement,
  titles: string[],
): Record<string, GroupHandle> {
  const tabBar = document.createElement("div");
  tabBar.className = "controls-panel__subtabs";

  const tabs: HTMLButtonElement[] = [];
  const sections: HTMLDivElement[] = [];
  const handles: Record<string, GroupHandle> = {};

  titles.forEach((title, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "controls-panel__subtab";
    tab.textContent = title;

    const section = document.createElement("div");
    section.className = "controls-panel__subsection";

    if (index === 0) {
      tab.classList.add("controls-panel__subtab--active");
      section.classList.add("controls-panel__subsection--active");
    }

    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("controls-panel__subtab--active"));
      sections.forEach((s) =>
        s.classList.remove("controls-panel__subsection--active"),
      );
      tab.classList.add("controls-panel__subtab--active");
      section.classList.add("controls-panel__subsection--active");
    });

    tabBar.appendChild(tab);
    tabs.push(tab);
    sections.push(section);
    handles[title] = createGroupHandle(section);
  });

  container.appendChild(tabBar);
  sections.forEach((section) => container.appendChild(section));

  return handles;
}

// A titled, removable card inside a group (the "layer card" primitive) -
// the caller populates it via the returned GroupHandle surface and can pull
// it out of the DOM again via remove().
function createRemovableGroup(
  container: HTMLElement,
  title: string,
): RemovableGroupHandle {
  const card = document.createElement("div");
  card.className = "controls-panel__group";

  const header = document.createElement("div");
  header.className = "controls-panel__group-header";
  header.textContent = title;
  card.appendChild(header);

  container.appendChild(card);

  return {
    ...createGroupHandle(card),
    remove() {
      card.remove();
    },
  };
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

  addGroup(title: string): GroupHandle {
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

    return createGroupHandle(section);
  }

  addSlider(config: SliderConfig): SliderHandle {
    if (!this.#currentSection)
      throw new Error("addSlider() called before any addGroup()");
    return createSliderRow(this.#currentSection, config);
  }

  addToggle(config: ToggleConfig): void {
    if (!this.#currentSection)
      throw new Error("addToggle() called before any addGroup()");
    createToggleRow(this.#currentSection, config);
  }

  toggle(): void {
    this.#visible = !this.#visible;
    this.#container.classList.toggle("visible", this.#visible);
  }
}
