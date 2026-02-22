/**
 * Minimal self-contained Marching Cubes implementation.
 * Converts a 3D scalar field into an isosurface triangle mesh.
 */

export interface MarchingCubesResult {
  positions: Float32Array; // xyz interleaved
  indices: Uint32Array;
  normals: Float32Array;   // xyz interleaved, per-vertex
}

export interface GridBounds {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Run marching cubes on a 3D scalar field.
 * @param field - flat array of scalar values, indexed [z * dimY * dimX + y * dimX + x]
 * @param dims  - [dimX, dimY, dimZ]
 * @param isoValue - the isosurface level
 * @param bounds - world-space AABB
 */
export function marchingCubes(
  field: Float32Array,
  dims: [number, number, number],
  isoValue: number,
  bounds: GridBounds,
): MarchingCubesResult {
  const [nx, ny, nz] = dims;
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  const dx = (maxX - minX) / (nx - 1);
  const dy = (maxY - minY) / (ny - 1);
  const dz = (maxZ - minZ) / (nz - 1);

  const positions: number[] = [];
  const indices: number[] = [];

  // Map from edge key to vertex index for sharing
  const edgeVertexMap = new Map<string, number>();

  function idx(x: number, y: number, z: number): number {
    return z * ny * nx + y * nx + x;
  }

  function worldPos(ix: number, iy: number, iz: number): [number, number, number] {
    return [minX + ix * dx, minY + iy * dy, minZ + iz * dz];
  }

  function interpolateEdge(
    p1: [number, number, number], v1: number,
    p2: [number, number, number], v2: number,
  ): [number, number, number] {
    if (Math.abs(v1 - v2) < 1e-10) {
      return [p1[0], p1[1], p1[2]];
    }
    const t = (isoValue - v1) / (v2 - v1);
    return [
      p1[0] + t * (p2[0] - p1[0]),
      p1[1] + t * (p2[1] - p1[1]),
      p1[2] + t * (p2[2] - p1[2]),
    ];
  }

  function getOrCreateVertex(
    ix1: number, iy1: number, iz1: number,
    ix2: number, iy2: number, iz2: number,
    edgeIdx: number,
  ): number {
    // Canonical edge key — always order smaller index first
    const k1 = iz1 * ny * nx + iy1 * nx + ix1;
    const k2 = iz2 * ny * nx + iy2 * nx + ix2;
    const key = k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;
    const existing = edgeVertexMap.get(key);
    if (existing !== undefined) return existing;

    const v1 = field[idx(ix1, iy1, iz1)];
    const v2 = field[idx(ix2, iy2, iz2)];
    const p1 = worldPos(ix1, iy1, iz1);
    const p2 = worldPos(ix2, iy2, iz2);
    const p = interpolateEdge(p1, v1, p2, v2);

    const vertIdx = positions.length / 3;
    positions.push(p[0], p[1], p[2]);
    edgeVertexMap.set(key, vertIdx);
    return vertIdx;
  }

  // Edge endpoints in terms of corner offsets [corner1, corner2]
  // Corners:  0=(0,0,0) 1=(1,0,0) 2=(1,1,0) 3=(0,1,0)
  //           4=(0,0,1) 5=(1,0,1) 6=(1,1,1) 7=(0,1,1)
  const EDGE_CORNERS: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  const CORNER_OFFSETS: [number, number, number][] = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];

  for (let iz = 0; iz < nz - 1; iz++) {
    for (let iy = 0; iy < ny - 1; iy++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        // Get the 8 corner values
        const vals: number[] = [];
        let hasNaN = false;
        for (let c = 0; c < 8; c++) {
          const v = field[idx(
            ix + CORNER_OFFSETS[c][0],
            iy + CORNER_OFFSETS[c][1],
            iz + CORNER_OFFSETS[c][2],
          )];
          if (isNaN(v)) { hasNaN = true; break; }
          vals.push(v);
        }
        if (hasNaN) continue;

        // Compute cube index
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          if (vals[c] < isoValue) cubeIndex |= (1 << c);
        }

        if (cubeIndex === 0 || cubeIndex === 255) continue;

        const edgeBits = EDGE_TABLE[cubeIndex];
        if (edgeBits === 0) continue;

        // For each edge that has an intersection, compute vertex
        const edgeVerts: number[] = new Array(12).fill(-1);
        for (let e = 0; e < 12; e++) {
          if (edgeBits & (1 << e)) {
            const [c1, c2] = EDGE_CORNERS[e];
            const o1 = CORNER_OFFSETS[c1];
            const o2 = CORNER_OFFSETS[c2];
            edgeVerts[e] = getOrCreateVertex(
              ix + o1[0], iy + o1[1], iz + o1[2],
              ix + o2[0], iy + o2[1], iz + o2[2],
              e,
            );
          }
        }

        // Build triangles
        const triRow = TRI_TABLE[cubeIndex];
        for (let t = 0; t < triRow.length; t += 3) {
          indices.push(edgeVerts[triRow[t]], edgeVerts[triRow[t + 1]], edgeVerts[triRow[t + 2]]);
        }
      }
    }
  }

  // Compute normals from scalar field gradient (central differences)
  const numVerts = positions.length / 3;
  const normals = new Float32Array(numVerts * 3);

  for (let i = 0; i < numVerts; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];

    // Sample gradient via central differences in world space
    const h = Math.min(dx, dy, dz) * 0.5;
    const gx = sampleFieldTrilinear(field, dims, bounds, px + h, py, pz)
             - sampleFieldTrilinear(field, dims, bounds, px - h, py, pz);
    const gy = sampleFieldTrilinear(field, dims, bounds, px, py + h, pz)
             - sampleFieldTrilinear(field, dims, bounds, px, py - h, pz);
    const gz = sampleFieldTrilinear(field, dims, bounds, px, py, pz + h)
             - sampleFieldTrilinear(field, dims, bounds, px, py, pz - h);

    const len = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (len > 1e-10) {
      normals[i * 3] = gx / len;
      normals[i * 3 + 1] = gy / len;
      normals[i * 3 + 2] = gz / len;
    } else {
      normals[i * 3 + 1] = 1; // fallback up
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    normals,
  };
}

/** Trilinear interpolation of the scalar field at an arbitrary world position */
function sampleFieldTrilinear(
  field: Float32Array,
  dims: [number, number, number],
  bounds: GridBounds,
  wx: number, wy: number, wz: number,
): number {
  const [nx, ny, nz] = dims;
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;

  // Convert to grid coordinates
  const gx = (wx - minX) / (maxX - minX) * (nx - 1);
  const gy = (wy - minY) / (maxY - minY) * (ny - 1);
  const gz = (wz - minZ) / (maxZ - minZ) * (nz - 1);

  const ix = Math.max(0, Math.min(nx - 2, Math.floor(gx)));
  const iy = Math.max(0, Math.min(ny - 2, Math.floor(gy)));
  const iz = Math.max(0, Math.min(nz - 2, Math.floor(gz)));

  const fx = gx - ix;
  const fy = gy - iy;
  const fz = gz - iz;

  function idx(x: number, y: number, z: number) {
    return z * ny * nx + y * nx + x;
  }

  const c000 = field[idx(ix, iy, iz)];
  const c100 = field[idx(ix + 1, iy, iz)];
  const c010 = field[idx(ix, iy + 1, iz)];
  const c110 = field[idx(ix + 1, iy + 1, iz)];
  const c001 = field[idx(ix, iy, iz + 1)];
  const c101 = field[idx(ix + 1, iy, iz + 1)];
  const c011 = field[idx(ix, iy + 1, iz + 1)];
  const c111 = field[idx(ix + 1, iy + 1, iz + 1)];

  // Any NaN → return 0
  if (isNaN(c000) || isNaN(c100) || isNaN(c010) || isNaN(c110) ||
      isNaN(c001) || isNaN(c101) || isNaN(c011) || isNaN(c111)) {
    return 0;
  }

  const c00 = c000 * (1 - fx) + c100 * fx;
  const c10 = c010 * (1 - fx) + c110 * fx;
  const c01 = c001 * (1 - fx) + c101 * fx;
  const c11 = c011 * (1 - fx) + c111 * fx;

  const c0 = c00 * (1 - fy) + c10 * fy;
  const c1 = c01 * (1 - fy) + c11 * fy;

  return c0 * (1 - fz) + c1 * fz;
}

// ─── Marching Cubes lookup tables ───
// Edge table: for each of 256 cube configurations, which edges are intersected (bitmask)
// prettier-ignore
const EDGE_TABLE: number[] = [
  0x0,0x109,0x203,0x30a,0x406,0x50f,0x605,0x70c,0x80c,0x905,0xa0f,0xb06,0xc0a,0xd03,0xe09,0xf00,
  0x190,0x99,0x393,0x29a,0x596,0x49f,0x795,0x69c,0x99c,0x895,0xb9f,0xa96,0xd9a,0xc93,0xf99,0xe90,
  0x230,0x339,0x33,0x13a,0x636,0x73f,0x435,0x53c,0xa3c,0xb35,0x83f,0x936,0xe3a,0xf33,0xc39,0xd30,
  0x3a0,0x2a9,0x1a3,0xaa,0x7a6,0x6af,0x5a5,0x4ac,0xbac,0xaa5,0x9af,0x8a6,0xfaa,0xea3,0xda9,0xca0,
  0x460,0x569,0x663,0x76a,0x66,0x16f,0x265,0x36c,0xc6c,0xd65,0xe6f,0xf66,0x86a,0x963,0xa69,0xb60,
  0x5f0,0x4f9,0x7f3,0x6fa,0x1f6,0xff,0x3f5,0x2fc,0xdfc,0xcf5,0xfff,0xef6,0x9fa,0x8f3,0xbf9,0xaf0,
  0x650,0x759,0x453,0x55a,0x256,0x35f,0x55,0x15c,0xe5c,0xf55,0xc5f,0xd56,0xa5a,0xb53,0x859,0x950,
  0x7c0,0x6c9,0x5c3,0x4ca,0x3c6,0x2cf,0x1c5,0xcc,0xfcc,0xec5,0xdcf,0xcc6,0xbca,0xac3,0x9c9,0x8c0,
  0x8c0,0x9c9,0xac3,0xbca,0xcc6,0xdcf,0xec5,0xfcc,0xcc,0x1c5,0x2cf,0x3c6,0x4ca,0x5c3,0x6c9,0x7c0,
  0x950,0x859,0xb53,0xa5a,0xd56,0xc5f,0xf55,0xe5c,0x15c,0x55,0x35f,0x256,0x55a,0x453,0x759,0x650,
  0xaf0,0xbf9,0x8f3,0x9fa,0xef6,0xfff,0xcf5,0xdfc,0x2fc,0x3f5,0xff,0x1f6,0x6fa,0x7f3,0x4f9,0x5f0,
  0xb60,0xa69,0x963,0x86a,0xf66,0xe6f,0xd65,0xc6c,0x36c,0x265,0x16f,0x66,0x76a,0x663,0x569,0x460,
  0xca0,0xda9,0xea3,0xfaa,0x8a6,0x9af,0xaa5,0xbac,0x4ac,0x5a5,0x6af,0x7a6,0xaa,0x1a3,0x2a9,0x3a0,
  0xd30,0xc39,0xf33,0xe3a,0x936,0x83f,0xb35,0xa3c,0x53c,0x435,0x73f,0x636,0x13a,0x33,0x339,0x230,
  0xe90,0xf99,0xc93,0xd9a,0xa96,0xb9f,0x895,0x99c,0x69c,0x795,0x49f,0x596,0x29a,0x393,0x99,0x190,
  0xf00,0xe09,0xd03,0xc0a,0xb06,0xa0f,0x905,0x80c,0x70c,0x605,0x50f,0x406,0x30a,0x203,0x109,0x0,
];

// Triangle table: for each of 256 cube configurations, list of edge indices forming triangles (-1 terminated)
// prettier-ignore
const TRI_TABLE_RAW: number[][] = [
  [],
  [0,8,3],
  [0,1,9],
  [1,8,3,9,8,1],
  [1,2,10],
  [0,8,3,1,2,10],
  [9,2,10,0,2,9],
  [2,8,3,2,10,8,10,9,8],
  [3,11,2],
  [0,11,2,8,11,0],
  [1,9,0,2,3,11],
  [1,11,2,1,9,11,9,8,11],
  [3,10,1,11,10,3],
  [0,10,1,0,8,10,8,11,10],
  [3,9,0,3,11,9,11,10,9],
  [9,8,10,10,8,11],
  [4,7,8],
  [4,3,0,7,3,4],
  [0,1,9,8,4,7],
  [4,1,9,4,7,1,7,3,1],
  [1,2,10,8,4,7],
  [3,4,7,3,0,4,1,2,10],
  [9,2,10,9,0,2,8,4,7],
  [2,10,9,2,9,7,2,7,3,7,9,4],
  [8,4,7,3,11,2],
  [11,4,7,11,2,4,2,0,4],
  [9,0,1,8,4,7,2,3,11],
  [4,7,11,9,4,11,9,11,2,9,2,1],
  [3,10,1,3,11,10,7,8,4],
  [1,11,10,1,4,11,1,0,4,7,11,4],
  [4,7,8,9,0,11,9,11,10,11,0,3],
  [4,7,11,4,11,9,9,11,10],
  [9,5,4],
  [9,5,4,0,8,3],
  [0,5,4,1,5,0],
  [8,5,4,8,3,5,3,1,5],
  [1,2,10,9,5,4],
  [3,0,8,1,2,10,4,9,5],
  [5,2,10,5,4,2,4,0,2],
  [2,10,5,3,2,5,3,5,4,3,4,8],
  [9,5,4,2,3,11],
  [0,11,2,0,8,11,4,9,5],
  [0,5,4,0,1,5,2,3,11],
  [2,1,5,2,5,8,2,8,11,4,8,5],
  [10,3,11,10,1,3,9,5,4],
  [4,9,5,0,8,1,8,10,1,8,11,10],
  [5,4,0,5,0,11,5,11,10,11,0,3],
  [5,4,8,5,8,10,10,8,11],
  [9,7,8,5,7,9],
  [9,3,0,9,5,3,5,7,3],
  [0,7,8,0,1,7,1,5,7],
  [1,5,3,3,5,7],
  [9,7,8,9,5,7,10,1,2],
  [10,1,2,9,5,0,5,3,0,5,7,3],
  [8,0,2,8,2,5,8,5,7,10,5,2],
  [2,10,5,2,5,3,3,5,7],
  [7,9,5,7,8,9,3,11,2],
  [9,5,7,9,7,2,9,2,0,2,7,11],
  [2,3,11,0,1,8,1,7,8,1,5,7],
  [11,2,1,11,1,7,7,1,5],
  [9,5,8,8,5,7,10,1,3,10,3,11],
  [5,7,0,5,0,9,7,11,0,1,0,10,11,10,0],
  [11,10,0,11,0,3,10,5,0,8,0,7,5,7,0],
  [11,10,5,7,11,5],
  [10,6,5],
  [0,8,3,5,10,6],
  [9,0,1,5,10,6],
  [1,8,3,1,9,8,5,10,6],
  [1,6,5,2,6,1],
  [1,6,5,1,2,6,3,0,8],
  [9,6,5,9,0,6,0,2,6],
  [5,9,8,5,8,2,5,2,6,3,2,8],
  [2,3,11,10,6,5],
  [11,0,8,11,2,0,10,6,5],
  [0,1,9,2,3,11,5,10,6],
  [5,10,6,1,9,2,9,11,2,9,8,11],
  [6,3,11,6,5,3,5,1,3],
  [0,8,11,0,11,5,0,5,1,5,11,6],
  [3,11,6,0,3,6,0,6,5,0,5,9],
  [6,5,9,6,9,11,11,9,8],
  [5,10,6,4,7,8],
  [4,3,0,4,7,3,6,5,10],
  [1,9,0,5,10,6,8,4,7],
  [10,6,5,1,9,7,1,7,3,7,9,4],
  [6,1,2,6,5,1,4,7,8],
  [1,2,5,5,2,6,3,0,4,3,4,7],
  [8,4,7,9,0,5,0,6,5,0,2,6],
  [7,3,9,7,9,4,3,2,9,5,9,6,2,6,9],
  [3,11,2,7,8,4,10,6,5],
  [5,10,6,4,7,2,4,2,0,2,7,11],
  [0,1,9,4,7,8,2,3,11,5,10,6],
  [9,2,1,9,11,2,9,4,11,7,11,4,5,10,6],
  [8,4,7,3,11,5,3,5,1,5,11,6],
  [5,1,11,5,11,6,1,0,11,7,11,4,0,4,11],
  [0,5,9,0,6,5,0,3,6,11,6,3,8,4,7],
  [6,5,9,6,9,11,4,7,9,7,11,9],
  [10,4,9,6,4,10],
  [4,10,6,4,9,10,0,8,3],
  [10,0,1,10,6,0,6,4,0],
  [8,3,1,8,1,6,8,6,4,6,1,10],
  [1,4,9,1,2,4,2,6,4],
  [3,0,8,1,2,9,2,4,9,2,6,4],
  [0,2,4,4,2,6],
  [8,3,2,8,2,4,4,2,6],
  [10,4,9,10,6,4,11,2,3],
  [0,8,2,2,8,11,4,9,10,4,10,6],
  [3,11,2,0,1,6,0,6,4,6,1,10],
  [6,4,1,6,1,10,4,8,1,2,1,11,8,11,1],
  [9,6,4,9,3,6,9,1,3,11,6,3],
  [8,11,1,8,1,0,11,6,1,9,1,4,6,4,1],
  [3,11,6,3,6,0,0,6,4],
  [6,4,8,11,6,8],
  [7,10,6,7,8,10,8,9,10],
  [0,7,3,0,10,7,0,9,10,6,7,10],
  [10,6,7,1,10,7,1,7,8,1,8,0],
  [10,6,7,10,7,1,1,7,3],
  [1,2,6,1,6,8,1,8,9,8,6,7],
  [2,6,9,2,9,1,6,7,9,0,9,3,7,3,9],
  [7,8,0,7,0,6,6,0,2],
  [7,3,2,6,7,2],
  [2,3,11,10,6,8,10,8,9,8,6,7],
  [2,0,7,2,7,11,0,9,7,6,7,10,9,10,7],
  [1,8,0,1,7,8,1,10,7,6,7,10,2,3,11],
  [11,2,1,11,1,7,10,6,1,6,7,1],
  [8,9,6,8,6,7,9,1,6,11,6,3,1,3,6],
  [0,9,1,11,6,7],
  [7,8,0,7,0,6,3,11,0,11,6,0],
  [7,11,6],
  [7,6,11],
  [3,0,8,11,7,6],
  [0,1,9,11,7,6],
  [8,1,9,8,3,1,11,7,6],
  [10,1,2,6,11,7],
  [1,2,10,3,0,8,6,11,7],
  [2,9,0,2,10,9,6,11,7],
  [6,11,7,2,10,3,10,8,3,10,9,8],
  [7,2,3,6,2,7],
  [7,0,8,7,6,0,6,2,0],
  [2,7,6,2,3,7,0,1,9],
  [1,6,2,1,8,6,1,9,8,8,7,6],
  [10,7,6,10,1,7,1,3,7],
  [10,7,6,1,7,10,1,8,7,1,0,8],
  [0,3,7,0,7,10,0,10,9,6,10,7],
  [7,6,10,7,10,8,8,10,9],
  [6,8,4,11,8,6],
  [3,6,11,3,0,6,0,4,6],
  [8,6,11,8,4,6,9,0,1],
  [9,4,6,9,6,3,9,3,1,11,3,6],
  [6,8,4,6,11,8,2,10,1],
  [1,2,10,3,0,11,0,6,11,0,4,6],
  [4,11,8,4,6,11,0,2,9,2,10,9],
  [10,9,3,10,3,2,9,4,3,11,3,6,4,6,3],
  [8,2,3,8,4,2,4,6,2],
  [0,4,2,4,6,2],
  [1,9,0,2,3,4,2,4,6,4,3,8],
  [1,9,4,1,4,2,2,4,6],
  [8,1,3,8,6,1,8,4,6,6,10,1],
  [10,1,0,10,0,6,6,0,4],
  [4,6,3,4,3,8,6,10,3,0,3,9,10,9,3],
  [10,9,4,6,10,4],
  [4,9,5,7,6,11],
  [0,8,3,4,9,5,11,7,6],
  [5,0,1,5,4,0,7,6,11],
  [11,7,6,8,3,4,3,5,4,3,1,5],
  [9,5,4,10,1,2,7,6,11],
  [6,11,7,1,2,10,0,8,3,4,9,5],
  [7,6,11,5,4,10,4,2,10,4,0,2],
  [3,4,8,3,5,4,3,2,5,10,5,2,11,7,6],
  [7,2,3,7,6,2,5,4,9],
  [9,5,4,0,8,6,0,6,2,6,8,7],
  [3,6,2,3,7,6,1,5,0,5,4,0],
  [6,2,8,6,8,7,2,1,8,4,8,5,1,5,8],
  [9,5,4,10,1,6,1,7,6,1,3,7],
  [1,6,10,1,7,6,1,0,7,8,7,0,9,5,4],
  [4,0,10,4,10,5,0,3,10,6,10,7,3,7,10],
  [7,6,10,7,10,8,5,4,10,4,8,10],
  [6,9,5,6,11,9,11,8,9],
  [3,6,11,0,6,3,0,5,6,0,9,5],
  [0,11,8,0,5,11,0,1,5,5,6,11],
  [6,11,3,6,3,5,5,3,1],
  [1,2,10,9,5,11,9,11,8,11,5,6],
  [0,11,3,0,6,11,0,9,6,5,6,9,1,2,10],
  [11,8,5,11,5,6,8,0,5,10,5,2,0,2,5],
  [6,11,3,6,3,5,2,10,3,10,5,3],
  [5,8,9,5,2,8,5,6,2,3,8,2],
  [9,5,6,9,6,0,0,6,2],
  [1,5,8,1,8,0,5,6,8,3,8,2,6,2,8],
  [1,5,6,2,1,6],
  [1,3,6,1,6,10,3,8,6,5,6,9,8,9,6],
  [10,1,0,10,0,6,9,5,0,5,6,0],
  [0,3,8,5,6,10],
  [10,5,6],
  [11,5,10,7,5,11],
  [11,5,10,11,7,5,8,3,0],
  [5,11,7,5,10,11,1,9,0],
  [10,7,5,10,11,7,9,8,1,8,3,1],
  [11,1,2,11,7,1,7,5,1],
  [0,8,3,1,2,7,1,7,5,7,2,11],
  [9,7,5,9,2,7,9,0,2,2,11,7],
  [7,5,2,7,2,11,5,9,2,3,2,8,9,8,2],
  [2,5,10,2,3,5,3,7,5],
  [8,2,0,8,5,2,8,7,5,10,2,5],
  [9,0,1,5,10,3,5,3,7,3,10,2],
  [9,8,2,9,2,1,8,7,2,10,2,5,7,5,2],
  [1,3,5,3,7,5],
  [0,8,7,0,7,1,1,7,5],
  [9,0,3,9,3,5,5,3,7],
  [9,8,7,5,9,7],
  [5,8,4,5,10,8,10,11,8],
  [5,0,4,5,11,0,5,10,11,11,3,0],
  [0,1,9,8,4,10,8,10,11,10,4,5],
  [10,11,4,10,4,5,11,3,4,9,4,1,3,1,4],
  [2,5,1,2,8,5,2,11,8,4,5,8],
  [0,4,11,0,11,3,4,5,11,2,11,1,5,1,11],
  [0,2,5,0,5,9,2,11,5,4,5,8,11,8,5],
  [9,4,5,2,11,3],
  [2,5,10,3,5,2,3,4,5,3,8,4],
  [5,10,2,5,2,4,4,2,0],
  [3,10,2,3,5,10,3,8,5,4,5,8,0,1,9],
  [5,10,2,5,2,4,1,9,2,9,4,2],
  [8,4,5,8,5,3,3,5,1],
  [0,4,5,1,0,5],
  [8,4,5,8,5,3,9,0,5,0,3,5],
  [9,4,5],
  [4,11,7,4,9,11,9,10,11],
  [0,8,3,4,9,7,9,11,7,9,10,11],
  [1,10,11,1,11,4,1,4,0,7,4,11],
  [3,1,4,3,4,8,1,10,4,7,4,11,10,11,4],
  [4,11,7,9,11,4,9,2,11,9,1,2],
  [9,7,4,9,11,7,9,1,11,2,11,1,0,8,3],
  [11,7,4,11,4,2,2,4,0],
  [11,7,4,11,4,2,8,3,4,3,2,4],
  [2,9,10,2,7,9,2,3,7,7,4,9],
  [9,10,7,9,7,4,10,2,7,0,7,8,2,8,7],
  [3,7,10,3,10,2,7,4,10,1,10,0,4,0,10],
  [1,10,2,8,7,4],
  [4,9,1,4,1,7,7,1,3],
  [4,9,1,4,1,7,0,8,1,8,7,1],
  [4,0,3,7,4,3],
  [4,8,7],
  [9,10,8,10,11,8],
  [3,0,9,3,9,11,11,9,10],
  [0,1,10,0,10,8,8,10,11],
  [3,1,10,11,3,10],
  [1,2,11,1,11,9,9,11,8],
  [3,0,9,3,9,11,1,2,9,2,11,9],
  [0,2,11,8,0,11],
  [3,2,11],
  [2,3,8,2,8,10,10,8,9],
  [9,10,2,0,9,2],
  [2,3,8,2,8,10,0,1,8,1,10,8],
  [1,10,2],
  [1,3,8,9,1,8],
  [0,9,1],
  [0,3,8],
  [],
];

// Convert the raw table to trimmed arrays (no -1 sentinel needed since we use length)
const TRI_TABLE: number[][] = TRI_TABLE_RAW;
