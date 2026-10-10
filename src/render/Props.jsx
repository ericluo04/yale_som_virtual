import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { COUNTERS, RECEPTION, SIGNAGE, DRUMS, MEETING, LIBRARY, ellPt } from '../layout.js'
import { slideTex, COURSE_KEYS } from '../slides.js'
import Scenery, { METAL } from './Scenery.jsx'
import Backdrop from './Backdrop.jsx'
import { OFF } from './debugCam.js'

// Procedural props: high counters, a reception desk, signage screens and exit signs over drum
// doors. Scanned models (plants, furniture, trees) live in Scenery.jsx, the view out in Backdrop.jsx.
const box = new THREE.BoxGeometry(1, 1, 1)
const cyl = new THREE.CylinderGeometry(1, 0.8, 1, 20)
const mats = {
  top: new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.35 }),
  base: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: '#b8bec4', metalness: 0.85, roughness: 0.3 }),
  // counter frames: dark painted steel (ambientCG Metal 027 normal and roughness)
  frame: new THREE.MeshStandardMaterial({ color: '#2e3033', metalness: 0.55, roughness: 1, ...METAL }),
  bezel: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.4 }),
}
const exitMat = (() => {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 48
  const g = c.getContext('2d')
  g.fillStyle = '#0d3b1e'
  g.fillRect(0, 0, 128, 48)
  g.fillStyle = '#4dff88'
  g.font = 'bold 32px Arial, sans-serif'
  g.fillText('EXIT', 26, 36)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  // a lit sign: brighter than 1 so it picks up a little bloom
  return new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.8, 1.8, 1.8), toneMapped: false })
})()

// slim white high counter on a dark steel frame (photo 01): top, two end frames, a footrest
function Counter({ k }) {
  const legX = k.w / 2 - 0.08
  return (
    <group position={[k.x, 0, k.z]}>
      <mesh geometry={box} material={mats.top} position={[0, 1.04, 0]} scale={[k.w, 0.05, k.d]} castShadow receiveShadow />
      {[-legX, legX].map((x) => (
        <group key={x}>
          <mesh geometry={box} material={mats.frame} position={[x, 0.51, 0]} scale={[0.05, 1.02, k.d - 0.12]} castShadow receiveShadow />
          <mesh geometry={box} material={mats.frame} position={[x, 0.02, 0]} scale={[0.07, 0.04, k.d - 0.04]} castShadow receiveShadow />
        </group>
      ))}
      <mesh geometry={box} material={mats.frame} position={[0, 0.98, 0]} scale={[k.w - 0.16, 0.06, 0.04]} castShadow />
      <mesh geometry={box} material={mats.steel} position={[0, 0.25, -Math.sign(k.z) * 0.12]} scale={[k.w - 0.2, 0.03, 0.03]} castShadow />
    </group>
  )
}

function Reception() {
  const r = RECEPTION
  return (
    <group position={[r.x, 0, r.z]}>
      <mesh geometry={box} material={mats.top} position={[0, 0.55, 0]} scale={[r.d, 1.1, r.w]} />
      <mesh geometry={box} material={mats.base} position={[-0.05, 0.05, 0]} scale={[r.d - 0.1, 0.1, r.w - 0.1]} />
      <mesh geometry={box} material={mats.steel} position={[0.2, 1.12, 0]} scale={[0.35, 0.03, r.w + 0.1]} />
    </group>
  )
}

function Signage() {
  const slideMats = useMemo(() => SIGNAGE.map((_, i) => new THREE.MeshBasicMaterial({ map: slideTex(COURSE_KEYS[(i + 3) % COURSE_KEYS.length], 'title'), toneMapped: false })), [])
  return SIGNAGE.map((s, i) => (
    <group key={i} position={[s.x, 1.9, s.z]} rotation={[0, s.rot, 0]}>
      <mesh geometry={box} material={mats.bezel} scale={[1.36, 0.8, 0.05]} />
      <mesh material={slideMats[i]} position={[0, 0, 0.03]}>
        <planeGeometry args={[1.28, 0.72]} />
      </mesh>
    </group>
  ))
}

// one exit sign over each drum's first door, facing the concourse
function ExitSigns() {
  const signs = useMemo(
    () =>
      DRUMS.map((d) => {
        const p = ellPt(d.c, d.rx + 0.05, d.rz + 0.05, d.doors[0])
        return { p, rot: Math.atan2(p[0] - d.c[0], p[1] - d.c[1]) }
      }),
    [],
  )
  return signs.map((s, i) => (
    <mesh key={i} material={exitMat} position={[s.p[0], 2.75, s.p[1]]} rotation={[0, s.rot, 0]}>
      <planeGeometry args={[0.42, 0.16]} />
    </mesh>
  ))
}

// ---------- wayfinding: brushed-aluminium plates with a bevelled edge and a printed face
// face drawn on a canvas at 512 px per metre so the type stays crisp up close
function plateTex(w, h, draw) {
  const PX = 512
  const c = document.createElement('canvas')
  c.width = Math.round(w * PX)
  c.height = Math.round(h * PX)
  const g = c.getContext('2d')
  g.fillStyle = '#2f3237'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#f4f3ef'
  g.textBaseline = 'middle'
  draw(g, c.width, c.height)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.repeat.set(1 / w, 1 / h) // the extruded face's UVs are its shape coordinates in metres
  return t
}
const plateEdge = new THREE.MeshStandardMaterial({ color: '#aeb3b8', metalness: 0.8, roughness: 0.35 })
const plateGeos = new Map()
function plateGeo(w, h) {
  const k = `${w}x${h}`
  if (!plateGeos.has(k)) {
    const r = Math.min(w, h) * 0.08
    const sh = new THREE.Shape()
    sh.moveTo(r, 0)
    sh.lineTo(w - r, 0)
    sh.quadraticCurveTo(w, 0, w, r)
    sh.lineTo(w, h - r)
    sh.quadraticCurveTo(w, h, w - r, h)
    sh.lineTo(r, h)
    sh.quadraticCurveTo(0, h, 0, h - r)
    sh.lineTo(0, r)
    sh.quadraticCurveTo(0, 0, r, 0)
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 6 })
    g.translate(-w / 2, -h / 2, 0)
    plateGeos.set(k, g)
  }
  return plateGeos.get(k)
}
function Plate({ p, rot, w, h, draw }) {
  const mat = useMemo(() => {
    const t = plateTex(w, h, draw) // UVs were generated before the geometry was centred
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.1 })
  }, [w, h, draw])
  return <mesh geometry={plateGeo(w, h)} material={[mat, plateEdge]} position={p} rotation={[0, rot, 0]} castShadow />
}

// room-number plates beside every meeting-room door, on the corridor side
const roomPlate = (num) => (g, w, h) => {
  g.font = `bold ${h * 0.42}px Helvetica, Arial, sans-serif`
  g.fillText(String(num), w * 0.1, h * 0.38)
  g.font = `${h * 0.17}px Helvetica, Arial, sans-serif`
  g.fillStyle = '#c9ccd1'
  g.fillText('Meeting room', w * 0.1, h * 0.75)
}
function RoomPlates() {
  return MEETING.map((m) => {
    const [hx, hz] = m.door.hinge
    const south = m.z > 0
    return <Plate key={m.num} p={[hx - 0.22, 1.5, hz + (south ? -0.06 : 0.06)]} rot={south ? Math.PI : 0} w={0.26} h={0.16} draw={roomPlate(m.num)} />
  })
}

// directional signs: one destination per line, arrow on the side it points to
const ARROW = { left: '\u2190', right: '\u2192', up: '\u2191' }
const dirSign = (lines) => (g, w, h) => {
  const lh = h / lines.length
  lines.forEach(([dir, text], i) => {
    const y = lh * (i + 0.5)
    g.font = `${lh * 0.36}px Helvetica, Arial, sans-serif`
    g.fillStyle = '#f4f3ef'
    if (dir === 'right') {
      g.textAlign = 'right'
      g.fillText(`${text}   ${ARROW.right}`, w * 0.94, y)
    } else {
      g.textAlign = 'left'
      g.fillText(`${ARROW[dir]}   ${text}`, w * 0.06, y)
    }
    if (i) {
      g.fillStyle = '#5a5e64'
      g.fillRect(w * 0.04, lh * i - 1, w * 0.92, 2)
    }
  })
}
const SIGNS = [
  // library's north outer wall, read facing south: east (the library door, Beinecke) is on the left
  { p: [-30.5, 2.1, LIBRARY.z0 - 0.105], rot: Math.PI, lines: [['left', 'Ross Library  2100'], ['left', 'Beinecke Terrace Room  2300']] },
  // library's south outer wall, read facing north: east is on the right
  { p: [-28.2, 2.1, LIBRARY.z1 + 0.105], rot: 0, lines: [['right', 'Ross Library  2100'], ['right', 'Beinecke Terrace Room  2300']] },
  // east column, read facing east toward the Beinecke door: north on the left, south on the right
  { p: [26.36, 2.1, -3.8], rot: -Math.PI / 2, lines: [['up', 'Beinecke Terrace Room  2300'], ['left', 'Classrooms  2210 \u2013 2230'], ['right', 'Classrooms  2410 \u2013 2430']] },
]
function DirectionSigns() {
  return SIGNS.map((sg, i) => {
    const h = 0.17 * sg.lines.length
    return <Plate key={i} p={sg.p} rot={sg.rot} w={1.0} h={h} draw={dirSign(sg.lines)} />
  })
}

export default function Props() {
  return (
    <>
      {COUNTERS.map((k, i) => (
        <Counter key={i} k={k} />
      ))}
      <Reception />
      <Signage />
      <ExitSigns />
      <RoomPlates />
      <DirectionSigns />
      <Suspense fallback={null}>
        {!OFF.has('scenery') && <Scenery />}
        {!OFF.has('backdrop') && <Backdrop />}
      </Suspense>
    </>
  )
}
