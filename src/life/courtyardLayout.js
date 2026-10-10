// Where everything on the courtyard lawn stands (Lan, round 4: "the courtyard still seems kinda bare. the four
// teachers and students set dont need to be so crowded and uniformly spaced"). One file so the lessons
// (SpellSchool.jsx, CourtyardRange.jsx, CourtyardLumos.jsx) and the fills (render/Lawn.jsx, CourtyardFills.jsx,
// CourtyardFolk.jsx) keep out of each other's way. World x runs east, z south; the lawn is at y = -5 and reaches
// about x +-18.7, z +-17 (the courtyard glass scaled by 0.86 and 0.85, World.jsx CourtyardFrame). The trees are
// render/Scenery.jsx COURT_TREES: (-11,-8) (0,-10.5) (11,-8) (-13,5) (13,5) (-5,9.5) (6,10). Hagrid stands at
// (-10.5,-2) (Faculty.jsx).
//
//   north edge   targets of the long-range class: rings, a suit of armour, a scarecrow (x -10.5 to 2.2)
//   north-west   the reading nook: two picnic blankets, four Labubus reading or asleep
//   north-east   Flitwick's Leviosa class, a tight half circle; the owl on its perch by the glass
//   west edge    Lockhart's long-range class: five students 4 m apart casting north across the lawn
//   centre       the fountain inside its ring of benches and a ring flower bed
//   east         McGonagall's Transfiguration clearing, three students, just east of the fountain
//   south-west   the wizard's chess board, two Labubus on stools
//   south        the stone path with flower beds and lanterns; Handsome Dan's statue beside it
//   south-east   Snape's Lumos class: two students on a blanket near the south glass
import { COURTYARD } from '../layout.js'

export const Y = -5

// lawn half extents from the courtyard outline (the paving band takes the outer 14 to 15 percent)
export const LAWN_HX = Math.max(...COURTYARD.map(([x]) => x)) * 0.86
export const LAWN_HZ = Math.max(...COURTYARD.map(([, z]) => z)) * 0.85
// the lawn's east or west edge at depth z (x > 0), read off the scaled outline
export function lawnEdgeX(z) {
  let best = 0
  const n = COURTYARD.length
  for (let i = 0; i < n; i++) {
    const [x0, z0] = COURTYARD[i]
    const [x1, z1] = COURTYARD[(i + 1) % n]
    const a = z0 * 0.85
    const b = z1 * 0.85
    if ((a - z) * (b - z) > 0 || a === b) continue
    const x = (x0 + ((z - a) / (b - a)) * (x1 - x0)) * 0.86
    best = Math.max(best, x)
  }
  return best
}

// ---------- the fountain (tools/blender/fountain.py) and what rings it
export const FOUNTAIN = { p: [0, 0], r: 2.78 } // r: the step ring under the basin
export const BENCH_RING = { r0: 3.6, r1: 4.05, gap: 0.3 } // four curved stone benches, gaps on the four axes
export const RING_BED = { r0: 4.45, r1: 5.05, gap: 0.3 } // flower bed outside the benches, same gaps

// ---------- the stone path from the south glass to the bench ring, with a flower bed either side
export const PATH = { z0: 18.8, z1: BENCH_RING.r1 + 0.15, half: 0.7 }
export const PATH_BEDS = { x0: 0.95, x1: 1.65, z0: 5.6, z1: 17.8 }

// ---------- spell classes that SpellSchool.jsx draws (the professor on a floating paver, students in an arc
// round P facing the professor): P, a point the class lies toward, the count, the arc radius R and half-width
// spread in radians. The professor stands on the glass side, so the nearest cloister sees the students' faces.
export const SCHOOL_GROUPS = [
  // tight half circle near the north-east glass, between the aspen at (11,-8) and the north edge
  { who: 'flitwick', spell: 'leviosa', P: [10.6, -14.3], toward: [9.6, -10.6], n: 5, scale: 1.3, R: 2.1, spread: 1.15 },
  // a small clearing on the fountain's east side: three students between the ring bed and McGonagall
  { who: 'mcgonagall', spell: 'transfig', P: [9.9, 0.6], toward: [6.0, 0.6], n: 3, R: 2.6, spread: 0.85 },
]

// ---------- Lockhart's long-range class along the whole west side (CourtyardRange.jsx)
// Five students 4 m apart down the west edge cast north-east at targets on the north edge, 15 to 25 m away.
export const RANGE = {
  who: 'lockhart',
  P: [-16.1, 13.7], // at the south end of the line, facing up it
  students: [9.5, 5.5, 1.5, -2.5, -6.5].map((z) => [-16.6, z]),
  // kind, position, height of the target's centre above the lawn
  targets: [
    { kind: 'ring', p: [-10.5, -15.2], h: 1.7 },
    { kind: 'armor', p: [-6.4, -15.5], h: 0 },
    { kind: 'ring', p: [-2.4, -14.7], h: 2.0 },
    { kind: 'scarecrow', p: [2.2, -15.6], h: 0 },
  ],
  reach: [14.5, 26], // a student picks among the targets this far away (m)
}

// ---------- Snape's Lumos class: two students on a blanket near the south glass (CourtyardLumos.jsx)
export const LUMOS = { who: 'snape', P: [9.6, 15.9], blanket: [9.6, 13.7], students: [[9.05, 13.6], [10.15, 13.8]] }

// ---------- fills (CourtyardFills.jsx static pieces, CourtyardFolk.jsx the living ones)
// wizard's chess: an 8 x 8 board of 0.75 m squares (6 m), players on stools at its west and east edges
export const CHESS = { c: [-9.0, 12.6], sq: 0.75, stools: [[-12.75, 12.6], [-5.25, 12.6]] }
// Handsome Dan in bronze on a granite plinth beside the path, facing the south cloister; a Labubu poses by him
export const STATUE = { p: [3.4, 14.2], yaw: -0.45, plinth: [1.5, 0.95, 0.9], poser: [4.75, 14.85], poserYaw: -0.2 }
// reading nook in the north-west corner: two picnic blankets (centre, yaw), a basket
export const NOOK = {
  blankets: [{ p: [-15.2, -11.3], r: 0.35 }, { p: [-13.4, -13.5], r: -0.25 }],
  basket: [-12.6, -13.0],
  // readers: position, yaw, clip; the Sit clips put the seat 0.11 m above the root
  readers: [
    { p: [-15.6, -11.0], yaw: 2.2, clip: 'SitRead' },
    { p: [-14.8, -11.7], yaw: 2.9, clip: 'Sleep' },
    { p: [-13.8, -13.2], yaw: 1.6, clip: 'SitRead' },
    { p: [-13.0, -13.85], yaw: 2.6, clip: 'SitRead' },
  ],
}
// the owl's perch by the north-east aspen, near the east glass (within 12 m of the east and north cloisters)
export const OWL = { p: [14.4, -10.6], h: 2.05, yaw: -2.2 }
// six iron lanterns on posts: four along the stone path, one on each gravel path
export const LANTERNS = [[-1.95, 6.6], [1.95, 10.0], [-1.95, 13.4], [1.95, 16.6], [-6.2, 5.0], [-8.4, -6.2]]
// low hedges just inside the east and west lawn edges: z from, z to, inset from the edge (m)
export const HEDGES = [
  { side: -1, z0: -8.6, z1: 11.2, inset: 0.75 },
  { side: 1, z0: -8.2, z1: 8.0, inset: 0.75 },
]
// winding gravel paths (centre lines, 0.9 m wide): the bench ring's west gap to the nook and to the chess
// board, and from the chess board across the stone path to the statue
export const GRAVEL = [
  [[-4.2, -0.1], [-6.2, -1.6], [-7.6, -4.6], [-9.0, -8.2], [-10.6, -10.6], [-12.4, -12.4]],
  [[-4.2, 0.2], [-5.8, 2.4], [-6.6, 5.4], [-7.9, 7.8], [-8.6, 9.4]],
  [[-5.0, 11.4], [-3.4, 12.3], [-0.6, 12.2]],
  [[0.6, 12.6], [1.8, 13.4], [2.5, 14.2]],
]
// Adirondack chairs (Lawn.jsx): moved off the long-range line and the statue spot
export const CHAIRS = [
  { p: [-2.7, 8.0], r: Math.PI / 2 + 0.25, c: 'blue' },
  { p: [-2.7, 14.6], r: Math.PI / 2 - 0.2, c: 'white' },
  { p: [2.7, 8.4], r: -Math.PI / 2 - 0.25, c: 'white' },
  { p: [5.9, 15.7], r: -Math.PI / 2 - 0.6, c: 'blue' },
  { p: [16.3, -5.4], r: -Math.PI / 2 - 0.3, c: 'blue' },
  { p: [16.0, -7.8], r: -Math.PI / 2 + 0.1, c: 'white' },
  { p: [16.6, -1.6], r: -Math.PI / 2 - 0.3, c: 'white' },
  { p: [16.6, 1.4], r: -Math.PI / 2 + 0.3, c: 'blue' },
]
// picnic tables: the west one moved off the target line to the south-east
export const PICNICS = [{ p: [15.0, 9.8], r: 0.4 }, { p: [4.8, -15.2], r: -0.08 }]
export const PLANTERS = [[-1.75, 17.9], [1.75, 17.9], [-8.2, -16.6], [8.2, -16.6]]
// string lights between two poles over the stone path, north of the statue
export const POLES = [[-3.2, 11.0], [3.2, 11.0]]
