/**
 * Floating control panel for simulation parameters.
 * Programmatic DOM construction (no HTML template needed).
 */

import { type SimParams, DEFAULT_PARAMS } from '../streamlines/compute';
import { PRESSURE_SLIDERS } from '../pressureViz/ui';

export interface ControlCallbacks {
  onParamChange: (params: SimParams) => void;
  onReset: () => void;
  onPauseToggle: (paused: boolean) => void;
}

const PARTICLE_PRESETS: { label: string; value: number }[] = [
  { label: '5k', value: 5000 },
  { label: '10k', value: 10000 },
  { label: '20k', value: 20000 },
  { label: '50k', value: 50000 },
];

export function createControls(
  initialParams: SimParams,
  callbacks: ControlCallbacks,
) {
  const params = { ...initialParams };
  let paused = false;
  let pendingUpdate = false;

  // Root panel
  const panel = document.createElement('div');
  panel.id = 'controls-panel';

  const title = document.createElement('div');
  title.className = 'cp-title';
  title.textContent = 'Controls';
  panel.appendChild(title);

  // --- Helpers ---
  function makeSliderRow(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onChange: (v: number) => void,
    format: (v: number) => string = (v) => v.toFixed(1),
  ) {
    const row = document.createElement('div');
    row.className = 'cp-row';

    const lbl = document.createElement('label');
    lbl.className = 'cp-label';
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'cp-slider';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);

    const valSpan = document.createElement('span');
    valSpan.className = 'cp-value';
    valSpan.textContent = String(value);

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valSpan.textContent = format(v);
      onChange(v);
      scheduleUpdate();
    });

    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(valSpan);
    panel.appendChild(row);

    return { input, valSpan };
  }

  function scheduleUpdate() {
    if (pendingUpdate) return;
    pendingUpdate = true;
    requestAnimationFrame(() => {
      pendingUpdate = false;
      callbacks.onParamChange({ ...params });
    });
  }

  // --- Sliders ---
  const uSlider = makeSliderRow('U (speed)', 0.1, 3.0, 0.1, params.uFreestream, (v) => {
    params.uFreestream = v;
  });
  const rSlider = makeSliderRow('R (radius)', 0.3, 2.0, 0.1, params.sphereRadius, (v) => {
    params.sphereRadius = v;
  });
  const gammaSlider = makeSliderRow('Gamma (wake)', 0.0, 2.0, 0.1, params.gamma, (v) => {
    params.gamma = v;
  });

  const pressureSurface = document.createElement('input');
  pressureSurface.type = 'checkbox';
  pressureSurface.className = 'cp-checkbox';
  pressureSurface.checked = params.pressureSurfaceEnabled;
  const pressureSurfaceRow = document.createElement('div');
  pressureSurfaceRow.className = 'cp-row';
  const pressureSurfaceLabel = document.createElement('label');
  pressureSurfaceLabel.className = 'cp-label';
  pressureSurfaceLabel.textContent = 'Surface Cp';
  pressureSurface.addEventListener('change', () => {
    params.pressureSurfaceEnabled = pressureSurface.checked;
    scheduleUpdate();
  });
  pressureSurfaceRow.appendChild(pressureSurfaceLabel);
  pressureSurfaceRow.appendChild(pressureSurface);
  panel.appendChild(pressureSurfaceRow);

  const pressureSlices = document.createElement('input');
  pressureSlices.type = 'checkbox';
  pressureSlices.className = 'cp-checkbox';
  pressureSlices.checked = params.pressureSlicesEnabled;
  const pressureSlicesRow = document.createElement('div');
  pressureSlicesRow.className = 'cp-row';
  const pressureSlicesLabel = document.createElement('label');
  pressureSlicesLabel.className = 'cp-label';
  pressureSlicesLabel.textContent = 'Pressure slices';
  pressureSlices.addEventListener('change', () => {
    params.pressureSlicesEnabled = pressureSlices.checked;
    scheduleUpdate();
  });
  pressureSlicesRow.appendChild(pressureSlicesLabel);
  pressureSlicesRow.appendChild(pressureSlices);
  panel.appendChild(pressureSlicesRow);

  const pressureContours = document.createElement('input');
  pressureContours.type = 'checkbox';
  pressureContours.className = 'cp-checkbox';
  pressureContours.checked = params.pressureContours;
  const pressureContoursRow = document.createElement('div');
  pressureContoursRow.className = 'cp-row';
  const pressureContoursLabel = document.createElement('label');
  pressureContoursLabel.className = 'cp-label';
  pressureContoursLabel.textContent = 'Cp contours';
  pressureContours.addEventListener('change', () => {
    params.pressureContours = pressureContours.checked;
    scheduleUpdate();
  });
  pressureContoursRow.appendChild(pressureContoursLabel);
  pressureContoursRow.appendChild(pressureContours);
  panel.appendChild(pressureContoursRow);

  const pressureSliderRefs: Array<{ key: keyof SimParams; input: HTMLInputElement; valSpan: HTMLSpanElement; fmt: (v: number) => string }> = [];
  for (const slider of PRESSURE_SLIDERS) {
    const fmt = slider.step >= 1 ? (v: number) => v.toFixed(0) : slider.step >= 0.1 ? (v: number) => v.toFixed(1) : (v: number) => v.toFixed(2);
    const row = makeSliderRow(slider.label, slider.min, slider.max, slider.step, Number(params[slider.key]), (v) => {
      (params as Record<string, number>)[slider.key] = v;
    }, fmt);
    row.valSpan.textContent = fmt(Number(params[slider.key]));
    pressureSliderRefs.push({ key: slider.key, input: row.input, valSpan: row.valSpan, fmt });
  }

  // --- Streamline count dropdown ---
  const selectRow = document.createElement('div');
  selectRow.className = 'cp-row';
  const selectLabel = document.createElement('label');
  selectLabel.className = 'cp-label';
  selectLabel.textContent = 'Particles';
  const select = document.createElement('select');
  select.className = 'cp-select';
  for (const preset of PARTICLE_PRESETS) {
    const opt = document.createElement('option');
    opt.value = String(preset.value);
    opt.textContent = preset.label;
    if (preset.value === params.numStreamlines) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    params.numStreamlines = parseInt(select.value, 10);
    scheduleUpdate();
  });
  selectRow.appendChild(selectLabel);
  selectRow.appendChild(select);
  panel.appendChild(selectRow);

  // --- Fluid type dropdown ---
  const fluidRow = document.createElement('div');
  fluidRow.className = 'cp-row';
  const fluidLabel = document.createElement('label');
  fluidLabel.className = 'cp-label';
  fluidLabel.textContent = 'Fluid';
  const fluidSelect = document.createElement('select');
  fluidSelect.className = 'cp-select';
  for (const f of [['air', 'Air'], ['water', 'Water']] as const) {
    const opt = document.createElement('option');
    opt.value = f[0];
    opt.textContent = f[1];
    if (f[0] === params.fluid) opt.selected = true;
    fluidSelect.appendChild(opt);
  }
  fluidSelect.addEventListener('change', () => {
    params.fluid = fluidSelect.value as SimParams['fluid'];
    scheduleUpdate();
  });
  fluidRow.appendChild(fluidLabel);
  fluidRow.appendChild(fluidSelect);
  panel.appendChild(fluidRow);

  // --- Wake checkbox ---
  const checkRow = document.createElement('div');
  checkRow.className = 'cp-row';
  const checkLabel = document.createElement('label');
  checkLabel.className = 'cp-label';
  checkLabel.textContent = 'Wake';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'cp-checkbox';
  checkbox.checked = params.wakeEnabled;
  checkbox.addEventListener('change', () => {
    params.wakeEnabled = checkbox.checked;
    scheduleUpdate();
  });
  checkRow.appendChild(checkLabel);
  checkRow.appendChild(checkbox);
  panel.appendChild(checkRow);

  // --- Buttons ---
  const btnRow = document.createElement('div');
  btnRow.className = 'cp-btn-row';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'cp-btn';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => {
    // Restore defaults
    Object.assign(params, DEFAULT_PARAMS);
    uSlider.input.value = String(params.uFreestream);
    uSlider.valSpan.textContent = params.uFreestream.toFixed(1);
    rSlider.input.value = String(params.sphereRadius);
    rSlider.valSpan.textContent = params.sphereRadius.toFixed(1);
    gammaSlider.input.value = String(params.gamma);
    gammaSlider.valSpan.textContent = params.gamma.toFixed(1);
    select.value = String(params.numStreamlines);
    fluidSelect.value = params.fluid;
    checkbox.checked = params.wakeEnabled;
    pressureSurface.checked = params.pressureSurfaceEnabled;
    pressureSlices.checked = params.pressureSlicesEnabled;
    pressureContours.checked = params.pressureContours;
    for (const slider of pressureSliderRefs) {
      slider.input.value = String(params[slider.key]);
      slider.valSpan.textContent = slider.fmt(Number(params[slider.key]));
    }
    callbacks.onReset();
  });

  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'cp-btn';
  pauseBtn.textContent = 'Pause';
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';
    callbacks.onPauseToggle(paused);
  });

  btnRow.appendChild(resetBtn);
  btnRow.appendChild(pauseBtn);
  panel.appendChild(btnRow);

  // --- FPS counter ---
  const fpsDiv = document.createElement('div');
  fpsDiv.className = 'cp-fps';
  fpsDiv.textContent = 'FPS: --';
  panel.appendChild(fpsDiv);

  // Append to body
  document.body.appendChild(panel);

  function updateFPS(fps: number) {
    fpsDiv.textContent = `FPS: ${fps.toFixed(0)}`;
  }

  function destroy() {
    panel.remove();
  }

  return { updateFPS, destroy };
}
