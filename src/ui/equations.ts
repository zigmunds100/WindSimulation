/**
 * Renders the physics equations used in the simulation below the scene.
 */

export function createEquations() {
  const container = document.getElementById('axes-overlay')!;

  const panel = document.createElement('div');
  panel.id = 'equations-panel';

  panel.innerHTML = `
    <div class="eq-title">Governing Equations</div>

    <div class="eq-section">
      <div class="eq-heading">Potential Flow Around a Cylinder</div>
      <div class="eq-block">
        <span class="eq-label">v<sub>x</sub> =</span>
        <span class="eq-math">U<sub>&infin;</sub> &middot; (1 &minus; R&sup2; &middot; (x&sup2; &minus; y&sup2;) / r&sup4;)</span>
      </div>
      <div class="eq-block">
        <span class="eq-label">v<sub>y</sub> =</span>
        <span class="eq-math">U<sub>&infin;</sub> &middot; (&minus;2 R&sup2; &middot; x y / r&sup4;)</span>
      </div>
      <div class="eq-note">where r&sup2; = x&sup2; + y&sup2;, R = sphere radius, U<sub>&infin;</sub> = freestream speed</div>
    </div>

    <div class="eq-section">
      <div class="eq-heading">Wake Perturbation (von K&aacute;rm&aacute;n-like)</div>
      <div class="eq-block">
        <span class="eq-label">&delta;v<sub>x</sub> =</span>
        <span class="eq-math">0.5 &Gamma; &middot; e<sup>&minus;0.15 &xi;</sup> &middot; e<sup>&minus;0.5 &eta;&sup2;</sup> &middot; sin(&pi; &xi;)</span>
      </div>
      <div class="eq-block">
        <span class="eq-label">&delta;v<sub>y</sub> =</span>
        <span class="eq-math">1.5 &Gamma; &middot; e<sup>&minus;0.15 &xi;</sup> &middot; e<sup>&minus;0.5 &eta;&sup2;</sup> &middot; cos(&pi; &xi;)</span>
      </div>
      <div class="eq-note">where &xi; = x / R (downstream), &eta; = y / R (transverse), &Gamma; = wake strength; applied for x &gt; 0</div>
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

  container.appendChild(panel);
}
