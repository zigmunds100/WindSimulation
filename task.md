Claude Code Task: WebGPU Wind-Tunnel Sphere Flow (Tier B) — Match Reference
Reference (must use)

There is a visual target image in the repo: wind_tunnel_sphere_reference.png.
Treat it as the “golden look” for composition, cleanliness, and wake style (blunt / engineering, not artistic).

Rule: Coordinator must start by describing what in the reference image we’re matching (camera framing, sphere size, streamline density, wake placement).

Goal

Build a browser-based wind tunnel visualization of airflow around a simple sphere (2D slice):

left→right incoming flow

flow wraps around sphere

visible wake/separation region behind sphere

clean, realistic, “wind tunnel” look like wind_tunnel_sphere_reference.png

Use Tier B: WebGPU compute (WGSL) for particle advection + GPU trail rendering.

Stack

Preferred: Babylon.js WebGPU + TypeScript + Vite
Babylon module constraint:

export const createScene = async (engine, canvas) => { ... }

Fallback rule: If Babylon compute integration blocks progress, switch to “raw WebGPU for sim + simple render”, but remain WebGPU.

Visual Spec (match the reference)

Neutral background (white/very light gray)

Sphere/circle: matte white + thin outline

Streamlines: thin, crisp, high-clarity lines (not rainbow art)

Wake: subtle vortex/turbulence behind sphere, clearly present

Camera: fixed orthographic / near-orthographic (2D slice feel)

Simulation (GPU compute)

Not full CFD. Use a believable field + particle advection:

Base uniform flow U in +X

Obstacle deflection around cylinder/sphere cross-section (analytic/potential-flow-like)

Wake enhancement: procedural von Kármán vortex street behind sphere + mild noise (controllable)

Particles:

RK2 (midpoint) integration recommended

Keep particles outside sphere radius; project + tangent nudge if inside

Respawn at inlet with jitter

Targets:

Smooth with 20k particles minimum

Stretch: 50k+

Rendering: “streamlines” via trail texture ping-pong

To get streak lines without storing long histories:

Fade previous trail texture (decay factor)

Draw particles into trail texture (additive/alpha)

Present trail to screen

Ping-pong textures each frame

UI Controls (minimal)

Flow speed (U)

Sphere radius (R)

Wake strength (Gamma)

Particle count preset (10k / 20k / 50k)

Reset, Pause

Wake on/off toggle

FPS counter

Project Structure
/assets
  wind_tunnel_sphere_reference.png

/src
  /engine
    sim.wgsl
    sim.ts
    trails.ts
    render.wgsl
  /scene
    createScene.ts
  /ui
    controls.ts
  main.ts
  style.css
index.html
README.md
docs/PLAN.md
docs/DECISIONS.md
docs/CHECKS.md
Milestones (do in order)
M0 — Planning (Coordinator MUST do first)

Create docs/PLAN.md with:

What we are matching from wind_tunnel_sphere_reference.png (bullet list)

Technical approach summary (buffers, compute pass, trail pass)

Milestone checklist M1–M4 with acceptance criteria

Parameter defaults (initial guesses) + tuning plan

No code until PLAN.md exists.

M1 — Bootstrap WebGPU + baseline view

Vite + TS + Babylon WebGPU init

Show sphere/circle centered + neutral background

If WebGPU missing: show message

Accept: app runs, sphere visible, stable.

M2 — GPU particles advect around sphere

Storage buffers for particles

Compute step moves particles

Render particles as points (even before trails)

Accept: flow wraps around sphere, respawns at inlet.

M3 — Trails / streamlines

Trail ping-pong textures

Fade + draw particles into trail each frame

Tune decay for crisp lines

Accept: looks like wind-tunnel streak lines.

M4 — Wake realism + controls + tuning to reference

Add controllable vortex street in wake

Implement UI controls + FPS

Tune streamline density + wake region to match reference feel

Accept: close visual match to reference, stable FPS.

3-Agent Roles
Coordinator

MUST start with docs/PLAN.md

Defines “match criteria” to reference image

Keeps scope tight and milestones enforced

Owns docs/DECISIONS.md (defaults, tuning notes)

Builder

Implements M1→M4 sequentially

Keeps sim on GPU (no per-particle CPU updates)

Clean TS modules + WGSL comments

Fixed timestep (dt accumulator) for stability

Checker

Runs app each milestone

Verifies acceptance criteria + performance

Logs issues + required fixes in docs/CHECKS.md

Adds “compare to reference” notes (what differs, what to adjust)

Iteration Protocol (per milestone)

Coordinator posts checklist

Builder implements + commits

Checker reviews, files concrete fixes or approves

Builder fixes → Checker re-checks

Final Acceptance

Works in Chrome/Edge WebGPU

Clean wind tunnel look, sphere + streamlines + wake

Controls work

≥20k particles smoothly on typical laptop

Documented plan + decisions + checks