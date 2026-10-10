import { useMemo } from 'react'
import * as THREE from 'three'
import { COUNTERS, RECEPTION, SIGNAGE, PLANTS, DRUMS, ellPt } from '../layout.js'
import { slideTex, COURSE_KEYS } from '../slides.js'

// Procedural props, all primitives (no downloaded models): high counters, a reception desk,
// signage screens, potted plants with a few leaf clusters, and exit signs over drum doors.
const box = new THREE.BoxGeometry(1, 1, 1)
const cyl = new THREE.CylinderGeometry(1, 0.8, 1, 20)
const leafGeo = new THREE.IcosahedronGeometry(1, 1)
const mats = {
  top: new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.35 }),
  base: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ color: '#b8bec4', metalness: 0.85, roughness: 0.3 }),
  pot: new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.55 }),
  soil: new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#3f7a35', roughness: 0.8, flatShading: true }),
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

function Counter({ k }) {
  return (
    <group position={[k.x, 0, k.z]}>
      <mesh geometry={box} material={mats.base} position={[0, 0.5, 0]} scale={[k.w - 0.1, 1, k.d - 0.15]} />
      <mesh geometry={box} material={mats.top} position={[0, 1.04, 0]} scale={[k.w, 0.05, k.d]} />
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

function Plants() {
  return PLANTS.map(([x, z], i) => (
    <group key={i} position={[x, 0, z]}>
      <mesh geometry={cyl} material={mats.pot} position={[0, 0.3, 0]} scale={[0.32, 0.6, 0.32]} />
      <mesh geometry={cyl} material={mats.soil} position={[0, 0.6, 0]} scale={[0.29, 0.02, 0.29]} />
      {[[0, 1.05, 0, 0.42], [0.22, 0.9, 0.1, 0.3], [-0.2, 0.95, -0.12, 0.32], [0.05, 1.35, -0.08, 0.3]].map(([a, b, c, r], j) => (
        <mesh key={j} geometry={leafGeo} material={mats.leaf} position={[a, b, c]} scale={[r, r * 1.1, r]} rotation={[j, i + j, 0]} />
      ))}
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
      <Plants />
      <ExitSigns />
    </>
  )
}
