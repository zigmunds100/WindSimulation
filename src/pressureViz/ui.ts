import type { SimParams } from '../streamlines/compute';

export interface PressureUiField {
  label: string;
  min: number;
  max: number;
  step: number;
  key: keyof SimParams;
}

export const PRESSURE_SLIDERS: PressureUiField[] = [
  { label: 'ρ (density)', min: 0.5, max: 5, step: 0.1, key: 'density' },
  { label: 'θ sep (deg)', min: 80, max: 160, step: 1, key: 'thetaSepDeg' },
  { label: 'Cp wake base', min: -0.8, max: 0.1, step: 0.01, key: 'cpWakeBase' },
  { label: 'Wake Cw', min: 0.0, max: 1.2, step: 0.01, key: 'wakeStrength' },
  { label: 'Wake σ/a', min: 0.5, max: 2.0, step: 0.05, key: 'wakeSigma' },
  { label: 'Wake L/a', min: 2.0, max: 10.0, step: 0.1, key: 'wakeLength' },
];
