import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { H, ROOF, EAST, BEIN, BOUNDS, COURTYARD, DRUMS, LIBRARY, inPoly } from '../layout.js'
import { OFF, QUALITY } from './debugCam.js'

// Sun about 60 degrees up from the south-west: high enough that the 7.2 m soffit keeps most
// of the concourse in shade, so the sunlit strips along the glass read as strips.
export const SUN_DIR = new THREE.Vector3(-0.42, 1.05, 0.45).normalize()
export const SUN = { color: '#fff4e2', intensity: 3.2 }
const CENTER = new THREE.Vector3((BOUNDS.xMin + EAST + BEIN.terrace) / 2, 0, (BOUNDS.zMin + BOUNDS.zMax) / 2)

// Fit the orthographic shadow camera to the building box in light space, so the 2048 map
// covers only the floor plate (about 5 cm per texel) and not empty sky.
function fitShadow(light) {
  const cam = light.shadow.camera
  const view = new THREE.Matrix4().lookAt(light.position, light.target.position, new THREE.Vector3(0, 1, 0))
  const inv = view.clone().invert()
  const xs = [BOUNDS.xMin, EAST + BEIN.terrace]
  const zs = [BOUNDS.zMin, BOUNDS.zMax]
  const ys = [-5, ROOF + 0.5]
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  for (const x of xs) for (const y of ys) for (const z of zs) box.expandByPoint(v.set(x, y, z).sub(light.position).applyMatrix4(inv))
  cam.left = box.min.x
  cam.right = box.max.x
  cam.bottom = box.min.y
  cam.top = box.max.y
  cam.near = Math.max(0.5, -box.max.z)
  cam.far = -box.min.z
  cam.updateProjectionMatrix()
}

// Static geometry casts and receives sun shadows. The map renders for the first frames
// only (gl.shadowMap.autoUpdate = false): the building does not move, and characters
// get no sun shadow, which keeps the shadow pass off the per-frame budget.
function ShadowSetup() {
  const { gl, scene } = useThree()
  const frames = useRef(0)
  useLayoutEffect(() => {
    if (import.meta.env.DEV) window.__three = { gl, scene }
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
  }, [gl])
  useFrame(() => {
    if (frames.current > 90) return
    frames.current++
    if (frames.current % 30 !== 1) return
    const walk = (o) => {
      if (o.userData.dynamic) return
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        const solid = mats.every((m) => !m.transparent && !m.transmission && m.type !== 'MeshBasicMaterial')
        o.castShadow = solid && !o.userData.noCast
        o.receiveShadow = mats.every((m) => m.type !== 'MeshBasicMaterial')
      }
      o.children.forEach(walk)
    }
    walk(scene)
    gl.shadowMap.needsUpdate = true
  })
  return null
}

function Sun() {
  const ref = useRef()
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.copy(CENTER)
    return o
  }, [])
  useLayoutEffect(() => {
    const l = ref.current
    l.target = target
    l.position.copy(CENTER).addScaledVector(SUN_DIR, 80)
    l.updateMatrixWorld()
    target.updateMatrixWorld()
    fitShadow(l)
  }, [target])
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={ref}
        color={SUN.color}
        intensity={SUN.intensity}
        castShadow={QUALITY !== 'low'}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={3}
      />
    </>
  )
}

// Small round recessed downlights in a loose 2.4 m grid; the photos show no linear fixtures
// in the concourse. Values above 1 feed the bloom pass.
export const DOWNLIGHT = { radius: 0.08, color: [1, 0.96, 0.9], strength: 4 }
const PANEL = new THREE.CircleGeometry(DOWNLIGHT.radius, 16).rotateX(Math.PI / 2)
const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...DOWNLIGHT.color).multiplyScalar(DOWNLIGHT.strength), toneMapped: false })
const trimMat = new THREE.MeshStandardMaterial({ color: '#cfd0d0', roughness: 0.4, metalness: 0.5 })
const TRIM = new THREE.CircleGeometry(0.12, 16).rotateX(Math.PI / 2)
// downlight centres [x, z]; the bake exporter (render/exportGLB.js) reads the same list
export function downlightSpots() {
  const out = []
  const { xMin, xMax, zMin, zMax } = BOUNDS
  for (let x = xMin + 1.2; x < xMax; x += 2.4)
    for (let z = zMin + 1.2; z < zMax; z += 2.4) if (!inPoly(x, z, COURTYARD)) out.push([x + ((Math.round(z / 2.4) % 2) * 0.6), z])
  for (let x = EAST + 1.2; x < EAST + BEIN.r; x += 2.4)
    for (let z = -BEIN.r; z < BEIN.r; z += 2.4) if (Math.hypot(x - EAST, z) < BEIN.r - 0.8) out.push([x, z])
  return out
}
function CeilingPanels() {
  const spots = useMemo(downlightSpots, [])
  const refs = [useRef(), useRef()]
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, H - 0.004, z)
      refs[0].current.setMatrixAt(i, m)
      m.makeTranslation(x, H - 0.002, z)
      refs[1].current.setMatrixAt(i, m)
    })
    refs.forEach((r) => (r.current.instanceMatrix.needsUpdate = true))
  }, [spots])
  return (
    <group userData={{ dynamic: true }}>
      <instancedMesh ref={refs[0]} args={[PANEL, panelMat, spots.length]} frustumCulled={false} />
      <instancedMesh ref={refs[1]} args={[TRIM, trimMat, spots.length]} frustumCulled={false} />
    </group>
  )
}

// Ten real point lights: one per classroom drum, two over the library reading tables.
// Shadowless, so each costs one light loop iteration per fragment.
export const ROOM_LIGHT = { color: '#ffe9cf', decay: 1.6 }
export function roomLightSpots() {
  const out = DRUMS.map((d) => ({ p: [d.c[0] - d.dir[0] * 1.5, H - 0.7, d.c[1] - d.dir[1] * 1.5], i: 16, d: Math.max(d.rx, d.rz) * 2.2 }))
  const lx = (LIBRARY.x0 + LIBRARY.x1) / 2
  out.push({ p: [lx, H - 0.7, -6], i: 18, d: 16 }, { p: [lx, H - 0.7, 6], i: 18, d: 16 })
  return out
}
function RoomLights() {
  const spots = useMemo(roomLightSpots, [])
  return spots.map((s, i) => <pointLight key={i} position={s.p} intensity={s.i} distance={s.d} decay={ROOM_LIGHT.decay} color={ROOM_LIGHT.color} />)
}

export default function Lighting() {
  return (
    <>
      <hemisphereLight args={['#eef2ff', '#9a8a74', 0.22]} />
      <ambientLight intensity={0.05} />
      <Sun />
      {!OFF.has('lights') && <RoomLights />}
      <CeilingPanels />
      {QUALITY !== 'low' && <ShadowSetup />}
    </>
  )
}
