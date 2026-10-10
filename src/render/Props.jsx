import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { COUNTERS, RECEPTION, SIGNAGE, DRUMS, ellPt } from '../layout.js'
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

export default function Props() {
  return (
    <>
      {COUNTERS.map((k, i) => (
        <Counter key={i} k={k} />
      ))}
      <Reception />
      <Signage />
      <ExitSigns />
      <Suspense fallback={null}>
        {!OFF.has('scenery') && <Scenery />}
        {!OFF.has('backdrop') && <Backdrop />}
      </Suspense>
    </>
  )
}
