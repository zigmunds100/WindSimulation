# Project: Visual match loop

Goal: match the reference image in reference/target.png by iterating on the WebGPU scene.

Rules:
- Use a two-subagent loop: checker -> builder -> render -> checker...
- Checker MUST NOT edit files. It outputs strict JSON with delta instructions.
- Builder MUST apply only deltas, minimal diffs, and keep scene parameterized.
- Coordinator owns the loop, stopping rules, and runs render commands.
- Stop when checker approved=true OR score>=9 OR max_iters reached.

Artifacts:
- reference/target.png = golden reference
- out/iter_XX.png = latest renders each iteration
- state/run.json = iteration history
