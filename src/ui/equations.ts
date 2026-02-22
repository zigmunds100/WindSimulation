/**
 * Renders the 3D physics equations used in the simulation as a fixed overlay.
 */

export function createEquations() {
  const panel = document.createElement('div');
  panel.id = 'equations-panel';

  // Toggle button
  const toggle = document.createElement('button');
  toggle.className = 'eq-toggle';
  toggle.textContent = 'Equations';
  toggle.addEventListener('click', () => {
    panel.classList.toggle('eq-collapsed');
  });
  panel.appendChild(toggle);

  const body = document.createElement('div');
  body.className = 'eq-body';
  body.innerHTML = `
    <div class="eq-section">
      <div class="eq-heading">Potential Flow Around a Sphere (3D)</div>
      <div class="eq-block">
        <span class="eq-label">v<sub>x</sub> =</span>
        <span class="eq-math">U(1 + R&sup3;(2x&sup2; &minus; y&sup2; &minus; z&sup2;) / 2r&sup5;)</span>
      </div>
      <div class="eq-block">
        <span class="eq-label">v<sub>y</sub> =</span>
        <span class="eq-math">U &middot; 3R&sup3; x y / 2r&sup5;</span>
      </div>
      <div class="eq-block">
        <span class="eq-label">v<sub>z</sub> =</span>
        <span class="eq-math">U &middot; 3R&sup3; x z / 2r&sup5;</span>
      </div>
      <div class="eq-note">where r&sup2; = x&sup2; + y&sup2; + z&sup2;, R = sphere radius, U = freestream speed</div>
    </div>

    <div class="eq-section">
      <div class="eq-heading">Wake Perturbation (3D)</div>
      <div class="eq-block">
        <span class="eq-label">&delta;v<sub>x</sub> =</span>
        <span class="eq-math">0.5 &Gamma; &middot; e<sup>&minus;0.15 &xi;</sup> &middot; e<sup>&minus;0.5 &rho;&sup2;</sup> &middot; sin(&pi; &xi;)</span>
      </div>
      <div class="eq-block">
        <span class="eq-label">&delta;v<sub>r</sub> =</span>
        <span class="eq-math">1.5 &Gamma; &middot; e<sup>&minus;0.15 &xi;</sup> &middot; e<sup>&minus;0.5 &rho;&sup2;</sup> &middot; cos(&pi; &xi;)</span>
      </div>
      <div class="eq-note">where &xi; = x / R, &rho;&sup2; = (y&sup2; + z&sup2;) / R&sup2;, &Gamma; = wake strength; applied for x &gt; 0</div>
    </div>

    <div class="eq-section">
      <div class="eq-heading">4th-Order Runge-Kutta Integration</div>
      <div class="eq-block">
        <span class="eq-math">
          k<sub>1</sub> = v(x<sub>n</sub>),&ensp;
          k<sub>2</sub> = v(x<sub>n</sub> + &frac12; &Delta;t &middot; k<sub>1</sub>),&ensp;
          k<sub>3</sub> = v(x<sub>n</sub> + &frac12; &Delta;t &middot; k<sub>2</sub>),&ensp;
          k<sub>4</sub> = v(x<sub>n</sub> + &Delta;t &middot; k<sub>3</sub>)
        </span>
      </div>
      <div class="eq-block">
        <span class="eq-label">x<sub>n+1</sub> =</span>
        <span class="eq-math">x<sub>n</sub> + (&Delta;t / 6)(k<sub>1</sub> + 2k<sub>2</sub> + 2k<sub>3</sub> + k<sub>4</sub>)</span>
      </div>
      <div class="eq-note">&Delta;t = 0.02 (halved near sphere surface for stability)</div>
    </div>
  `;
  panel.appendChild(body);

  document.body.appendChild(panel);
}
