import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Environment } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import {
  H, EAST, BOUNDS, COURTYARD, DRUMS, DRUM_WALL, WALLS, CHAIRS, SCREENS, BOARDS, LECTERNS,
  STAIRS, MEETING, MEET_DOOR, BEIN, BEIN_TABLES, PLANTS, LIBRARY, RISE, inPoly, ellPt, tierOutline,
  BENCHES, COLUMNS, ROOF,
} from './layout.js'
import * as T from './textures.js'
import LabubuParty, { MeetingLabubus } from './LabubuParty.jsx'
import LabubuCrowd from './LabubuCrowd.jsx'
import Faculty from './Faculty.jsx'
import HandsomeDan from './HandsomeDan.jsx'
import { COURSE_KEYS, slideTex } from './slides.js'
import { rng } from './textures.js'
import Lighting from './render/Lighting.jsx'
import { pbr, worldUV } from './render/pbr.js'
import Props from './render/Props.jsx'
import { EXPORT, BakeExport } from './render/exportGLB.js'
import BakedBuilding, { BAKED } from './render/Baked.jsx'

// procedural architecture is drawn only when the baked building (render/Baked.jsx) is off
const PROC = !BAKED

const TAU = Math.PI * 2

// ---------- helpers
function Instanced({ items, material, geometry, bake }) {
  const ref = useRef()
  useLayoutEffect(() => {
    if (!ref.current) return // empty item lists render nothing
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    items.forEach((it, i) => {
      p.set(...it.p)
      e.set(0, it.r || 0, 0)
      q.setFromEuler(e)
      s.set(...(it.s || [1, 1, 1]))
      m.compose(p, q, s)
      ref.current.setMatrixAt(i, m)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [items])
  if (!items.length) return null
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} userData={bake ? { bake } : {}} />
}

const BOX = new THREE.BoxGeometry(1, 1, 1)
const slideMats = new Map()
const slideMat = (course, kind) => {
  const k = `${course}-${kind}`
  if (!slideMats.has(k)) slideMats.set(k, new THREE.MeshBasicMaterial({ map: slideTex(course, kind), toneMapped: false }))
  return slideMats.get(k)
}

function wallItems(mat) {
  return WALLS.filter((w) => w.mat === mat).map((w) => {
    const dx = w.b[0] - w.a[0]
    const dz = w.b[1] - w.a[1]
    return {
      p: [(w.a[0] + w.b[0]) / 2, w.y0 + w.h / 2, (w.a[1] + w.b[1]) / 2],
      r: -Math.atan2(dz, dx),
      s: [Math.max(Math.hypot(dx, dz), 0.01) + 0.02, w.h, w.t],
    }
  })
}

// vertical strip along a closed polyline
function ribbon(points, y0, y1, uPerMeter = 0.25) {
  const pts = [...points, points[0]]
  const pos = []
  const uv = []
  const idx = []
  let u = 0
  pts.forEach((p, i) => {
    if (i > 0) u += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) * uPerMeter
    pos.push(p[0], y0, p[1], p[0], y1, p[1])
    uv.push(u, 0, u, 1)
    if (i > 0) {
      const a = (i - 1) * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function Arc({ c, rx, rz = rx, a0, a1, y0 = 0, h = H, material, bake }) {
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, h, 72, 1, true, a0, a1 - a0), [h, a0, a1])
  return <mesh geometry={geo} material={material} position={[c[0], y0 + h / 2, c[1]]} scale={[rx, 1, rz]} userData={bake ? { bake } : {}} />
}

function Plane({ p, rot = 0, w, h, material }) {
  return (
    <mesh position={p} rotation={[0, rot, 0]} material={material}>
      <planeGeometry args={[w, h]} />
    </mesh>
  )
}

// ---------- materials
function useMaterials() {
  return useMemo(() => {
    const std = (o) => new THREE.MeshStandardMaterial(o)
    // thin glass: physical material so the panes pick up environment reflections and a
    // Fresnel edge; plain alpha blending keeps glass-behind-glass visible
    const glass = (color, opacity) =>
      new THREE.MeshPhysicalMaterial({
        color, transparent: true, opacity, roughness: 0.05, metalness: 0, ior: 1.5, specularIntensity: 1,
        envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false,
      })
    const plaster = pbr('plaster', { color: false })
    const wood = pbr('wood')
    const M = {
      white: worldUV(std({ color: '#f2f0ec', roughness: 1, ...plaster, normalScale: new THREE.Vector2(0.35, 0.35) }), 0.5),
      // classroom front wall behind the screens, darker than the plaster so the screens read
      sage: worldUV(std({ color: '#8d8f8c', roughness: 1, normalMap: plaster.normalMap, roughnessMap: plaster.roughnessMap, normalScale: new THREE.Vector2(0.35, 0.35) }), 0.5),
      exterior: glass('#8fa3b5', 0.2),
      glass: glass('#d7ecf2', 0.14),
      libGlass: glass('#d7ecf2', 0.12),
      beinGlass: glass('#d7ecf2', 0.12),
      meetGlass: glass('#c9d6e6', 0.22),
      rail: glass('#9fb3c8', 0.3),
      slats: std({ map: T.slatsTex(), roughness: 0.7 }),
      desk: worldUV(std({ ...wood, color: '#e8c9a8', roughness: 0.9 }), 0.8),
      shelf: std({ map: T.booksTex(), roughness: 0.8 }),
      leather: std({ color: '#9a5530', roughness: 0.45 }),
      plinth: std({ color: '#2b2b2b', roughness: 0.6 }),
      orange: std({ color: '#d4552a', roughness: 0.8 }),
      chair: std({ color: '#0a0a0b', roughness: 0.85, envMapIntensity: 0.25 }),
      // glossy deep-blue glass drums (photos 01-05): clear-coated so they mirror the room
      drum: new THREE.MeshPhysicalMaterial({ map: T.drumTex(), roughness: 0.12, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.4 }),
      // acoustic wall panels change colour from room to room: lavender, sage, gold, beige, grey
      drumIn: ['#7b7fb0', '#9aa77a', '#c9a96a', '#cdbfa5', '#a3a5a8', '#7b7fb0', '#9aa77a', '#c9a96a'].map((color) =>
        std({ color, roughness: 0.95, side: THREE.BackSide }),
      ),
      frosted: std({ color: '#e9eef2', transparent: true, opacity: 0.75, roughness: 0.3 }),
      // concourse: matte pale warm grey, finely striped (carpet normal + roughness, own colour map)
      carpet: std({ ...pbr('carpet', { repeat: [0.6, 0.6], color: 'concourse' }), roughness: 1 }),
      roomCarpet: std({ ...pbr('carpet', { repeat: [7, 7], color: 'concourse' }), color: '#a9a9a6', roughness: 1 }),
      tierCarpet: std({ ...pbr('carpet', { repeat: [0.6, 0.6], color: 'concourse' }), color: '#a9a9a6', roughness: 1 }),
      stepEdge: std({ color: '#d9822b', roughness: 0.7 }),
      beinCarpet: std({ ...pbr('carpet', { repeat: [14, 14] }), color: '#e6dccb', roughness: 1 }),
      stone: std({ map: T.stoneTex([2, 2]), roughness: 0.95 }),
      ceiling: std({ color: '#f7f5f0', roughness: 1, side: THREE.DoubleSide }),
      lawn: std({ map: T.lawnTex(), roughness: 1 }),
      ground: std({ color: '#2b3a26', roughness: 1 }),
      cafe: std({ map: T.cafeTex(), emissive: '#ffffff', emissiveMap: T.cafeTex(), emissiveIntensity: 0.35, roughness: 0.3, side: THREE.DoubleSide }),
      silver: std({ color: '#9aa3a8', metalness: 0.8, roughness: 0.3 }),
      canopy: std({ color: '#f1f0ec', roughness: 0.9, side: THREE.DoubleSide }),
      paving: std({ map: T.stoneTex([0.5, 0.5]), color: '#e4e0d8', roughness: 0.95 }),
      mural: std({ map: T.muralTex(), roughness: 0.9, side: THREE.DoubleSide }),
      velvet: std({ color: '#0d0b10', roughness: 1 }),
      mullion: std({ color: '#2a2d33', roughness: 0.4, metalness: 0.6 }),
      steel: std({ color: '#c9ced6', metalness: 0.9, roughness: 0.25 }),
      tableGlass: std({ color: '#cfe6ee', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.3 }),
      screen: new THREE.MeshBasicMaterial({ map: T.screenTex() }),
      poster: new THREE.MeshBasicMaterial({ map: T.posterTex() }),
      board: std({ color: '#fbfbf8', roughness: 0.3 }),
      dark: std({ color: '#1b1c20', roughness: 0.6 }),
      exit: new THREE.MeshBasicMaterial({ map: T.exitTex() }),
      opening: std({ map: T.stairOpeningTex(), roughness: 0.9 }),
      pot: std({ color: '#26262a', roughness: 0.7 }),
      leaf: std({ color: '#3f7a35', roughness: 0.9 }),
      lamp: new THREE.MeshBasicMaterial({ color: '#fffaf0' }),
      column: std({ color: '#e8e8e6', roughness: 0.5 }),
    }
    // the bake exporter (render/exportGLB.js) and the baked loader find materials by key
    for (const [k, m] of Object.entries(M)) (Array.isArray(m) ? m : [m]).forEach((x, i) => (x.userData.key = Array.isArray(m) ? `${k}${i}` : k))
    M.ceiling.userData.oneSided = true // only the underside is ever seen; bake that face alone
    return M
  }, [])
}

// ---------- scene setup: env reflections + dusk sky
// drei's Environment writes scene.environmentIntensity even with background="only", so it gets
// the same value
const ENV_INTENSITY = 0.35
function Atmosphere() {
  const { gl, scene } = useThree()
  useLayoutEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = ENV_INTENSITY
    return () => {
      env.dispose()
      pm.dispose()
    }
  }, [gl, scene])
  // The HDRI is the sky seen through the courtyard and exterior glass. Interior reflections
  // keep the RoomEnvironment above: an outdoor sky as the only environment tints every
  // indoor surface blue.
  return (
    <>
      <Environment files={`${import.meta.env.BASE_URL}hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr`} background="only" backgroundIntensity={1} environmentIntensity={ENV_INTENSITY} />
      <Lighting />
    </>
  )
}

// ---------- floor + ceiling with the courtyard hole
function FloorAndCeiling({ M }) {
  const [floor, ceil, lawn] = useMemo(() => {
    const { xMin, xMax, zMin, zMax } = BOUNDS
    const make = (flip) => {
      const f = (x, z) => new THREE.Vector2(x, flip ? -z : z)
      const s = new THREE.Shape([f(xMin, zMin), f(xMax, zMin), f(xMax, zMax), f(xMin, zMax)])
      s.holes.push(new THREE.Path(COURTYARD.map(([x, z]) => f(x, z))))
      // the floor stops just inside each classroom's carpet disc, so no lightmap texels go
      // to floor that the disc hides
      if (flip)
        for (const d of DRUMS)
          s.holes.push(new THREE.Path(Array.from({ length: 64 }, (_, i) => ellPt(d.c, d.rx - DRUM_WALL - 0.05, d.rz - DRUM_WALL - 0.05, (i / 64) * TAU)).map(([x, z]) => f(x, z))))
      const g = new THREE.ShapeGeometry(s)
      g.rotateX(flip ? -Math.PI / 2 : Math.PI / 2)
      return g
    }
    const lawnShape = new THREE.Shape(COURTYARD.map(([x, z]) => new THREE.Vector2(x, -z)))
    const lg = new THREE.ShapeGeometry(lawnShape)
    lg.rotateX(-Math.PI / 2)
    return [make(true), make(false), lg]
  }, [])
  return (
    <>
      {PROC && (
        <>
          <mesh geometry={floor} material={M.carpet} userData={{ bake: 'floor' }} />
          <mesh geometry={ceil} material={M.ceiling} position={[0, H, 0]} userData={{ bake: 'ceiling' }} />
          <mesh geometry={lawn} material={M.lawn} position={[0, -5, 0]} userData={{ bake: 'lawn' }} />
        </>
      )}
      <mesh material={M.ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, -5.05, 0]}>
        <planeGeometry args={[600, 600]} />
      </mesh>
    </>
  )
}

function Courtyard({ M }) {
  // clear glass from the concourse floor to the roof; level 4 behind it is real geometry
  const glass = useMemo(() => ribbon(COURTYARD, 0, ROOF), [])
  const cafe = useMemo(() => ribbon(COURTYARD, -5, 0, 1 / 15), [])
  const mullions = useMemo(
    // silver mullions about 1.6 m apart from the lawn to the roof
    () => COURTYARD.filter((_, i) => i % 2 === 0).map(([x, z]) => ({ p: [x, (ROOF - 5) / 2, z], s: [0.06, ROOF + 5, 0.06] })),
    [],
  )
  const cafeTables = useMemo(() => {
    const r = rng(4)
    const out = []
    for (let i = 0; i < 14; i++) {
      const a = r() * TAU
      out.push({ p: [Math.sin(a) * 12, -4.6, Math.cos(a) * 14], s: [0.9, 0.06, 0.9] })
    }
    return out
  }, [])
  return (
    <>
      <mesh geometry={glass} material={M.glass} />
      <mesh geometry={cafe} material={M.cafe} />
      <Level4 M={M} />
      {PROC && <Instanced items={mullions} material={M.mullion} geometry={BOX} />}
      {/* the lawn trees are scanned models now (render/Scenery.jsx) */}
      <CourtyardFrame M={M} />
      <Instanced items={cafeTables} material={M.board} geometry={BOX} />
      <group userData={{ dynamic: true }}>
        <LabubuParty />
      </group>
    </>
  )
}

// closed polyline pushed out by d along its vertex normals (away from the origin)
function offsetLoop(pts, d) {
  const m = pts.length
  return pts.map((p, i) => {
    const a = pts[(i - 1 + m) % m]
    const b = pts[(i + 1) % m]
    let nx = b[1] - a[1]
    let nz = -(b[0] - a[0])
    const l = Math.hypot(nx, nz) || 1
    nx /= l
    nz /= l
    if (nx * p[0] + nz * p[1] < 0) [nx, nz] = [-nx, -nz]
    return [p[0] + nx * d, p[1] + nz * d]
  })
}

// Level 4 as seen across the courtyard (photo 06): the classroom drums of the floor above, stacked
// on the level 2 drums, with the level 4 slab edge set back from the curtain wall behind a glass
// balustrade and a pale ceiling under the roof. Unbaked; only the courtyard view reaches it.
const L4 = { floor: H + 0.12, top: ROOF - 0.6, slot: 0.9 }
function Level4({ M }) {
  const geos = useMemo(() => {
    const { xMin, xMax, zMin, zMax } = BOUNDS
    const edge = offsetLoop(COURTYARD, L4.slot)
    // the floor stops at the slot; the ceiling runs to the glass, so no sun falls through the slot
    const plate = (flip) => {
      const f = (x, z) => new THREE.Vector2(x, flip ? -z : z)
      const s = new THREE.Shape([f(xMin, zMin), f(xMax, zMin), f(xMax, zMax), f(xMin, zMax)])
      s.holes.push(new THREE.Path((flip ? edge : COURTYARD).map(([x, z]) => f(x, z))))
      const g = new THREE.ShapeGeometry(s)
      g.rotateX(flip ? -Math.PI / 2 : Math.PI / 2)
      return g
    }
    const drum = new THREE.CylinderGeometry(1, 1, L4.top - L4.floor, 72, 1, true)
    return {
      floor: plate(true),
      ceil: plate(false),
      fascia: ribbon(edge, H - 0.05, L4.floor + 0.02),
      rail: ribbon(offsetLoop(COURTYARD, L4.slot - 0.03), L4.floor, L4.floor + 1.05),
      handrail: ribbon(offsetLoop(COURTYARD, L4.slot - 0.03), L4.floor + 1.03, L4.floor + 1.08),
      drum,
      walls: ribbon([[xMin, zMin], [xMax, zMin], [xMax, zMax], [xMin, zMax]], H, L4.top, 0.1),
    }
  }, [])
  const mats = useMemo(() => {
    const std = (o) => new THREE.MeshStandardMaterial(o)
    return {
      floor: std({ color: '#b9b5ae', roughness: 1 }),
      // the soffit under the roof reads lit, as in the dusk photos, without real-time lights
      ceil: std({ color: '#f2f1ed', emissive: '#fff6e8', emissiveIntensity: 0.35, roughness: 1 }),
      fascia: std({ color: '#efeeea', roughness: 0.8, side: THREE.DoubleSide }),
      walls: std({ color: '#d9d8d3', roughness: 1, side: THREE.DoubleSide }),
    }
  }, [])
  return (
    <group>
      <mesh geometry={geos.floor} material={mats.floor} position={[0, L4.floor, 0]} />
      <mesh geometry={geos.ceil} material={mats.ceil} position={[0, L4.top, 0]} />
      <mesh geometry={geos.fascia} material={mats.fascia} />
      <mesh geometry={geos.rail} material={M.rail} />
      <mesh geometry={geos.handrail} material={M.silver} />
      <mesh geometry={geos.walls} material={mats.walls} />
      {DRUMS.map((d) => (
        <mesh key={d.id} geometry={geos.drum} material={M.drum} position={[d.c[0], (L4.floor + L4.top) / 2, d.c[1]]} scale={[d.rx, 1, d.rz]} />
      ))}
    </group>
  )
}

// rounded rectangle as a closed polyline (for the canopy's sky opening)
function roundRect(hx, hz, r, n = 8) {
  const pts = []
  const corners = [[hx - r, hz - r, 0], [-(hx - r), hz - r, 1], [-(hx - r), -(hz - r), 2], [hx - r, -(hz - r), 3]]
  for (const [cx, cz, q] of corners)
    for (let i = 0; i <= n; i++) {
      const a = (q + i / n) * (Math.PI / 2)
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
    }
  return pts
}

// What frames the view across the courtyard: stone paving round the lawn, slim white columns
// from the lawn to the roof, and the deep white roof canopy that leaves a 27 x 25 m sky opening.
function CourtyardFrame({ M }) {
  const geos = useMemo(() => {
    const v = (pts) => pts.map(([x, z]) => new THREE.Vector2(x, -z))
    const pave = new THREE.Shape(v(COURTYARD))
    pave.holes.push(new THREE.Path(v(COURTYARD.map(([x, z]) => [x * 0.86, z * 0.85]))))
    const pg = new THREE.ShapeGeometry(pave)
    pg.rotateX(-Math.PI / 2)
    const hole = roundRect(13.5, 12.5, 2.5)
    const can = new THREE.Shape(v(COURTYARD.map(([x, z]) => [x * 1.03, z * 1.03])))
    can.holes.push(new THREE.Path(v(hole)))
    const cg = new THREE.ShapeGeometry(can)
    cg.rotateX(-Math.PI / 2)
    const fascia = ribbon(hole, ROOF - 0.9, ROOF + 0.3)
    return { pg, cg, fascia }
  }, [])
  const cols = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 20)
    return { g, items: COLUMNS.map((c) => {
      const top = c.court ? ROOF : H
      return { p: [c.x, (c.y0 + top) / 2, c.z], s: [c.court ? 0.25 : 0.22, top - c.y0, c.court ? 0.25 : 0.22] }
    }) }
  }, [])
  if (!PROC) return null
  return (
    <>
      <mesh geometry={geos.pg} material={M.paving} position={[0, -4.98, 0]} userData={{ bake: 'paving' }} />
      <mesh geometry={geos.cg} material={M.canopy} position={[0, ROOF, 0]} userData={{ bake: 'canopy' }} />
      <mesh geometry={geos.fascia} material={M.canopy} userData={{ bake: 'fascia' }} />
      <Instanced items={cols.items} material={M.column} geometry={cols.g} bake="columns" />
    </>
  )
}

// curved cognac banquette on a dark plinth, buttoned top panel (photos 03-05, 24)
function Banquettes({ M }) {
  const geos = useMemo(() => {
    const R = 6 // radius of the curve
    const sector = (r0, r1, h, len) => {
      const a = len / R / 2
      const sh = new THREE.Shape()
      const n = 16
      for (let i = 0; i <= n; i++) {
        const t = -a + (2 * a * i) / n
        const p = [Math.cos(t) * r1 - R, Math.sin(t) * r1]
        i ? sh.lineTo(...p) : sh.moveTo(...p)
      }
      for (let i = n; i >= 0; i--) {
        const t = -a + (2 * a * i) / n
        sh.lineTo(Math.cos(t) * r0 - R, Math.sin(t) * r0)
      }
      const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 })
      g.rotateX(-Math.PI / 2) // extrude upward; local z of the shape becomes -z
      return g
    }
    return BENCHES.map((b) => ({
      seat: sector(R - 0.42, R + 0.42, 0.22, b.len),
      back: sector(R + 0.18, R + 0.42, 0.38, b.len - 0.2),
      plinth: sector(R - 0.34, R + 0.34, 0.2, b.len - 0.15),
    }))
  }, [])
  return BENCHES.map((b, i) => (
    <group key={i} position={[b.c[0], 0, b.c[1]]} rotation={[0, b.rot, 0]}>
      <mesh geometry={geos[i].plinth} material={M.plinth} />
      <mesh geometry={geos[i].seat} material={M.leather} position={[0, 0.2, 0]} />
      <mesh geometry={geos[i].back} material={M.leather} position={[0, 0.42, 0]} />
    </group>
  ))
}

// ---------- walls (instanced by material)
const WALL_MATS = ['white', 'sage', 'exterior', 'libGlass', 'beinGlass', 'meetGlass', 'slats', 'desk', 'shelf', 'leather', 'orange']
// classroom desks are their own bake group: the Blender detail pass swaps them for
// continuous horseshoe desks (tools/bake/detail.py); the library tables stay boxes
const inDrum = (it) => DRUMS.some((d) => ((it.p[0] - d.c[0]) / d.rx) ** 2 + ((it.p[2] - d.c[1]) / d.rz) ** 2 < 1)
function Walls({ M }) {
  const groups = useMemo(
    () => WALL_MATS.flatMap((m) => {
      const items = wallItems(m)
      if (m !== 'desk') return [[m, items, 'walls']]
      return [[m, items.filter((it) => !inDrum(it)), 'walls'], ['deskRows', items.filter(inDrum), 'drumdesks']]
    }),
    [],
  )
  return groups.filter(([m]) => PROC || M[m]?.transparent).map(([m, items, bake]) => <Instanced key={m} items={items} material={M[m === 'deskRows' ? 'desk' : m]} geometry={BOX} bake={bake} />)
}

// ---------- stadium-seating risers: stacked slabs, carpet on top, orange step edges
function Tiers({ M }) {
  const geos = useMemo(() => {
    const out = []
    for (const d of DRUMS)
      for (let i = 1; i < d.tiers.n; i++) {
        const outline = tierOutline(d, i)
        if (!outline) continue
        const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)))
        const g = new THREE.ExtrudeGeometry(shape, { depth: RISE, bevelEnabled: false })
        g.rotateX(-Math.PI / 2)
        g.translate(0, (i - 1) * RISE + 0.005, 0)
        out.push([d.id, g])
      }
    return out
  }, [])
  if (!PROC) return null
  return geos.map(([id, g], i) => <mesh key={i} geometry={g} material={[M.tierCarpet, M.stepEdge]} userData={{ bake: `tiers_${id}` }} />)
}

// ---------- classroom drums
function Drums({ M }) {
  const signs = useMemo(() => DRUMS.map((d) => new THREE.MeshBasicMaterial({ map: T.signTex(d.name, d.id) })), [])
  const disc = useMemo(() => {
    const g = new THREE.CircleGeometry(1, 48)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  return DRUMS.map((d, i) => {
    const { c, rx, rz, gap, doors, arcs } = d
    const sp = ellPt(c, rx + 0.03, rz + 0.03, doors[0] + gap + 0.16)
    const n = [sp[0] - c[0], sp[1] - c[1]]
    return (
      <group key={d.id}>
        {PROC && arcs.map(([a0, a1], j) => (
          <group key={j}>
            <Arc c={c} rx={rx} rz={rz} a0={a0} a1={a1} material={M.drum} bake={`drum_${d.id}`} />
            <Arc c={c} rx={rx - DRUM_WALL} rz={rz - DRUM_WALL} a0={a0} a1={a1} material={M.drumIn[i % M.drumIn.length]} bake={`drumin_${d.id}`} />
          </group>
        ))}
        {doors.map((a, j) => {
          const e1 = ellPt(c, rx, rz, a + gap)
          const e2 = ellPt(c, rx, rz, a - gap)
          return (
            <mesh
              key={j}
              material={M.frosted}
              position={[(e1[0] + e2[0]) / 2, (2.45 + H) / 2, (e1[1] + e2[1]) / 2]}
              rotation={[0, -Math.atan2(e2[1] - e1[1], e2[0] - e1[0]), 0]}
            >
              <boxGeometry args={[Math.hypot(e1[0] - e2[0], e1[1] - e2[1]), H - 2.45, 0.08]} />
            </mesh>
          )
        })}
        {PROC && <mesh geometry={disc} material={M.roomCarpet} position={[c[0], 0.004, c[1]]} scale={[rx - DRUM_WALL, 1, rz - DRUM_WALL]} userData={{ bake: `room_${d.id}` }} />}
        <Plane p={[sp[0], 1.55, sp[1]]} rot={Math.atan2(n[0], n[1])} w={0.5} h={0.62} material={signs[i]} />
      </group>
    )
  })
}

function ClassroomStuff({ M }) {
  const seats = useMemo(() => CHAIRS.map((c) => ({ p: [c.x, (c.y || 0) + 0.47, c.z], r: c.rot, s: [0.5, 0.08, 0.5] })), [])
  const backs = useMemo(
    () => CHAIRS.map((c) => ({ p: [c.x + Math.sin(c.rot) * 0.22, (c.y || 0) + 0.8, c.z + Math.cos(c.rot) * 0.22], r: c.rot, s: [0.5, 0.6, 0.06] })),
    [],
  )
  const legs = useMemo(() => CHAIRS.map((c) => ({ p: [c.x, (c.y || 0) + 0.22, c.z], s: [0.06, 0.44, 0.06] })), [])
  return (
    <>
      <Instanced items={seats} material={M.chair} geometry={BOX} />
      <Instanced items={backs} material={M.chair} geometry={BOX} />
      <Instanced items={legs} material={M.mullion} geometry={BOX} />
      {SCREENS.map((s, i) => (
        <Plane key={i} p={[s.x, 2.95, s.z]} rot={s.rot} w={2.1} h={1.18} material={slideMat(s.course, s.kind)} />
      ))}
      {BOARDS.map((b, i) => (
        <mesh key={i} position={[b.x, 1.45, b.z]} rotation={[0, b.rot, 0]} material={M.board}>
          <boxGeometry args={[b.w, 1.0, 0.04]} />
        </mesh>
      ))}
      {LECTERNS.map((l, i) => (
        <mesh key={i} position={[l.x, 0.55, l.z]} rotation={[0, l.rot, 0]} material={M.dark}>
          <boxGeometry args={[0.7, 1.1, 0.5]} />
        </mesh>
      ))}
    </>
  )
}

// ---------- Beinecke Terrace Room + terrace
function Beinecke({ M }) {
  const { c, r, terrace, doorGap, muralR, muralHalf } = BEIN
  const geos = useMemo(() => {
    const half = (rr) => {
      const g = new THREE.CircleGeometry(rr, 64, -Math.PI / 2, Math.PI)
      return g
    }
    const floor = half(r)
    floor.rotateX(-Math.PI / 2)
    const ceil = half(r)
    ceil.rotateX(Math.PI / 2)
    const ter = new THREE.RingGeometry(r, terrace, 64, 1, -Math.PI / 2, Math.PI)
    ter.rotateX(-Math.PI / 2)
    const over = new THREE.RingGeometry(r, r + 2.9, 64, 1, -Math.PI / 2, Math.PI)
    over.rotateX(Math.PI / 2)
    return { floor, ceil, ter, over }
  }, [r, terrace])
  const sign = useMemo(() => new THREE.MeshBasicMaterial({ map: T.signTex('Beinecke Terrace Room', '2300') }), [])
  const libSign = useMemo(() => new THREE.MeshBasicMaterial({ map: T.signTex('Ross Library', '2100') }), [])
  const col = BEIN.col
  return (
    <>
      {PROC && (
        <>
          <mesh geometry={geos.floor} material={M.beinCarpet} position={[c[0], 0.002, c[1]]} userData={{ bake: 'bein_floor' }} />
          <mesh geometry={geos.ceil} material={M.ceiling} position={[c[0], H, c[1]]} userData={{ bake: 'bein_ceiling' }} />
          <mesh geometry={geos.ter} material={M.stone} position={[c[0], 0.001, c[1]]} userData={{ bake: 'terrace' }} />
          <mesh geometry={geos.over} material={M.ceiling} position={[c[0], H, c[1]]} userData={{ bake: 'terrace_soffit' }} />
          <Arc c={c} rx={r - 0.3} a0={0.12} a1={1.0} h={H - 0.2} material={M.velvet} bake="bein_curtain" />
          <Arc c={c} rx={muralR} a0={Math.PI / 2 - muralHalf} a1={Math.PI / 2 + muralHalf} h={3.8} material={M.mural} bake="bein_mural" />
          <mesh position={[col[0], H / 2, col[1]]} material={M.column} userData={{ bake: 'bein_column' }}>
            <cylinderGeometry args={[0.25, 0.25, H, 20]} />
          </mesh>
        </>
      )}
      <Arc c={c} rx={r} a0={0} a1={Math.PI / 2 - doorGap} material={M.glass} />
      <Arc c={c} rx={r} a0={Math.PI / 2 + doorGap} a1={Math.PI} material={M.glass} />
      <Arc c={c} rx={terrace} a0={0} a1={Math.PI} h={1.05} material={M.rail} />
      {BEIN_TABLES.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.74, z]} material={M.desk}>
          <cylinderGeometry args={[0.8, 0.8, 0.04, 32]} />
        </mesh>
      ))}
      <Plane p={[EAST - 0.12, 1.55, -2.0]} rot={-Math.PI / 2} w={0.5} h={0.62} material={sign} />
      <Plane p={[LIBRARY.x1 + 0.08, 1.55, 2.0]} rot={Math.PI / 2} w={0.5} h={0.62} material={libSign} />
      <Plane p={[EAST - 0.15, 2.3, 14.8]} rot={-Math.PI / 2} w={3.2} h={3.6} material={M.poster} />
    </>
  )
}

// ---------- stairwells with paintings above
function Stairs({ M }) {
  const mats = useMemo(() => {
    return STAIRS.map((s) => {
      if (s.photo) {
        const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/stair-g.jpg`)
        t.colorSpace = THREE.SRGBColorSpace
        t.repeat.set(215 / 1200, 282 / 1600)
        t.offset.set(450 / 1200, 1 - 797 / 1600)
        return new THREE.MeshBasicMaterial({ map: t })
      }
      return new THREE.MeshBasicMaterial({ map: T.paintingTex(s.seed) })
    })
  }, [])
  return STAIRS.map((s, i) => {
    const ext = s.face[0] !== 0 ? s.w / 2 : s.d / 2
    const off = ext + 0.12
    const p = [s.c[0] + s.face[0] * off, s.c[1] + s.face[1] * off]
    const rot = Math.atan2(s.face[0], s.face[1])
    return (
      <group key={s.id}>
        <Plane p={[p[0], 1.2, p[1]]} w={1.8} h={2.4} rot={rot} material={M.opening} />
        <Plane p={[p[0] + s.face[0] * 0.01, 2.5, p[1] + s.face[1] * 0.01]} w={0.5} h={0.18} rot={rot} material={M.exit} />
        <mesh position={[p[0], 3.5, p[1]]} rotation={[0, rot, 0]} material={M.dark}>
          <boxGeometry args={[1.4, 1.78, 0.04]} />
        </mesh>
        <Plane p={[p[0] + s.face[0] * 0.03, 3.5, p[1] + s.face[1] * 0.03]} w={1.25} h={1.64} rot={rot} material={mats[i]} />
      </group>
    )
  })
}

// glass door on a hinge with a long metal bar handle; swings open when you walk up to it
function GlassDoor({ door, M }) {
  const ref = useRef()
  const { camera } = useThree()
  const [hx, hz] = door.hinge
  const mid = [hx + MEET_DOOR / 2, hz]
  useFrame((_, dt) => {
    const near = Math.hypot(camera.position.x - mid[0], camera.position.z - mid[1]) < 2.4
    const target = near ? door.swing * 1.45 : 0
    ref.current.rotation.y += (target - ref.current.rotation.y) * Math.min(1, dt * 6)
  })
  const handleX = MEET_DOOR - 0.12
  return (
    <group ref={ref} position={[hx, 0, hz]}>
      <mesh material={M.meetGlass} position={[MEET_DOOR / 2, 1.17, 0]}>
        <boxGeometry args={[MEET_DOOR - 0.02, 2.3, 0.03]} />
      </mesh>
      {[0.03, 2.31].map((y) => (
        <mesh key={y} material={M.steel} position={[MEET_DOOR / 2, y, 0]}>
          <boxGeometry args={[MEET_DOOR, 0.05, 0.045]} />
        </mesh>
      ))}
      {[-0.07, 0.07].map((zo) => (
        <group key={zo}>
          <mesh material={M.steel} position={[handleX, 1.05, zo]}>
            <cylinderGeometry args={[0.016, 0.016, 0.95, 12]} />
          </mesh>
          {[0.65, 1.45].map((y) => (
            <mesh key={y} material={M.steel} position={[handleX, y, zo / 2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.01, 0.01, Math.abs(zo), 8]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ---------- meeting rooms: glass table, black chairs (in CHAIRS), giant monitor on the side wall
function MeetingRooms({ M }) {
  const tops = useMemo(() => MEETING.map((m) => ({ p: [m.x, 0.74, m.z], s: [2.6, 0.03, 1.2] })), [])
  const legs = useMemo(
    () => MEETING.flatMap((m) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ p: [m.x + sx * 1.15, 0.37, m.z + sz * 0.5], s: [0.05, 0.74, 0.05] })))),
    [],
  )
  const bezels = useMemo(() => MEETING.map((m) => ({ p: [m.monitor.x + 0.03, 1.65, m.monitor.z], r: m.monitor.rot, s: [2.75, 1.6, 0.05] })), [])
  return (
    <>
      <Instanced items={tops} material={M.tableGlass} geometry={BOX} />
      <Instanced items={legs} material={M.mullion} geometry={BOX} />
      <Instanced items={bezels} material={M.dark} geometry={BOX} />
      {MEETING.map((m, i) => (
        <Plane
          key={i}
          p={[m.monitor.x, 1.65, m.monitor.z]}
          rot={m.monitor.rot}
          w={2.6}
          h={1.46}
          material={slideMat(COURSE_KEYS[i % COURSE_KEYS.length], i % 2 ? 'content' : 'chart')}
        />
      ))}
      <group userData={{ dynamic: true }}>
        {MEETING.map((m, i) => (
          <GlassDoor key={i} door={m.door} M={M} />
        ))}
        <MeetingLabubus />
      </group>
    </>
  )
}

// ---------- plants (ceiling lights live in render/Lighting.jsx)
function Details({ M }) {
  return (
    <>
      <Props />
      <MeetingRooms M={M} />
    </>
  )
}

export default function World() {
  const M = useMaterials()
  return (
    <>
      <Atmosphere />
      {EXPORT && <BakeExport />}
      {BAKED && (
        <Suspense fallback={null}>
          <BakedBuilding M={M} />
        </Suspense>
      )}
      <FloorAndCeiling M={M} />
      <Courtyard M={M} />
      <Walls M={M} />
      <Drums M={M} />
      <Tiers M={M} />
      <ClassroomStuff M={M} />
      <Beinecke M={M} />
      <Stairs M={M} />
      <Details M={M} />
      <Banquettes M={M} />
      <group userData={{ dynamic: true }}>
        <LabubuCrowd />
        <Faculty />
        <HandsomeDan />
      </group>
    </>
  )
}
