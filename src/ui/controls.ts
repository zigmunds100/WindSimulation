/**
 * Floating control panel for simulation parameters.
 * Programmatic DOM construction (no HTML template needed).
 */

import { type SimParams, DEFAULT_PARAMS } from '../streamlines/compute';

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
      valSpan.textContent = v.toFixed(1);
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
