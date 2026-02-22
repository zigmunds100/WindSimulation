/**
 * HTML overlay for matplotlib-style axes: title, x/y labels, tick marks, border.
 */

const DOMAIN_MIN: [number, number] = [-4, -3];
const DOMAIN_MAX: [number, number] = [8, 3];

const X_TICKS = [-4, -2, 0, 2, 4, 6, 8];
const Y_TICKS = [-3, -2, -1, 0, 1, 2, 3];

export function createAxes() {
  const container = document.getElementById('axes-overlay')!;

  // Title
  const title = document.createElement('div');
  title.className = 'axis-title';
  title.textContent = 'Wind-tunnel style reference: streamline slice around a sphere (2D cross-section)';
  container.appendChild(title);

  // Y-axis label
  const yLabel = document.createElement('div');
  yLabel.className = 'axis-label-y';
  yLabel.textContent = 'y';
  container.appendChild(yLabel);

  // X-axis label
  const xLabel = document.createElement('div');
  xLabel.className = 'axis-label-x';
  xLabel.textContent = 'x';
  container.appendChild(xLabel);

  // Y ticks
  const plotArea = document.getElementById('plot-area')!;
  for (const val of Y_TICKS) {
    const tick = document.createElement('div');
    tick.className = 'tick-y';
    // Map value to percentage (bottom = DOMAIN_MIN[1], top = DOMAIN_MAX[1])
    const pct = ((val - DOMAIN_MIN[1]) / (DOMAIN_MAX[1] - DOMAIN_MIN[1])) * 100;
    tick.style.bottom = `${pct}%`;
    tick.textContent = String(val);
    plotArea.appendChild(tick);
  }

  // X ticks
  for (const val of X_TICKS) {
    const tick = document.createElement('div');
    tick.className = 'tick-x';
    const pct = ((val - DOMAIN_MIN[0]) / (DOMAIN_MAX[0] - DOMAIN_MIN[0])) * 100;
    tick.style.left = `${pct}%`;
    tick.textContent = String(val);
    plotArea.appendChild(tick);
  }
}
