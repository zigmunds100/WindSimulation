# Wind Tunnel Simulation Plan

## Reference Match Criteria
- Blue streamlines flowing left-to-right around sphere
- Orange-outlined circle centered near origin
- Domain X:[-4,8] Y:[-3,3]
- Light gray/white background
- Visible wake region behind sphere
- High streamline density

## Technical Approach
- WebGPU compute shaders for particle advection (potential flow + wake)
- RK2 midpoint integration
- Ping-pong trail textures for streamline rendering
- SDF-based sphere rendering in composite pass

## Milestones
- M1: WebGPU bootstrap + sphere visible
- M2: GPU particle advection around sphere
- M3: Trail/streamline rendering
- M4: Wake + UI controls + visual tuning

## Parameters
| Param | Default |
|-------|---------|
| U | 1.0 |
| R | 1.0 |
| gamma | 0.5 |
| particleCount | 20000 |
| trailDecay | 0.975 |
