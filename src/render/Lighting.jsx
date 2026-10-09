import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { H, EAST, BOUNDS, COURTYARD, DRUMS, LIBRARY, inPoly } from '../layout.js'
import { OFF, QUALITY } from './debugCam.js'

// Sun elevation matches the HDRI (Kloofendal 48d), azimuth from the south-west so light
// rakes across the courtyard glass into the east and north cloisters.
const SUN_DIR = new THREE.Vector3(-0.45, 0.74, 0.5).normalize()
const CENTER = new THREE.Vector3((BOUNDS.xMin + EAST + 14) / 2, 0, 0)

// Fit the orthographic shadow camera to the building box in light space, so the 2048 map
// covers only the floor plate (about 5 cm per texel) and not empty sky.
function fitShadow(light) {
  const cam = light.shadow.camera
  const view = new THREE.Matrix4().lookAt(light.position, light.target.position, new THREE.Vector3(0, 1, 0))
  const inv = view.clone().invert()
  const xs = [BOUNDS.xMin, EAST + 14]
  const zs = [BOUNDS.zMin, BOUNDS.zMax]
  const ys = [-5, H + 9]
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
        color="#fff4e2"
        intensity={6}
        castShadow={QUALITY !== 'low'}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={3}
      />
    </>
  )
}

// Recessed linear LED panels on a 2.4 m x 3.6 m grid. Values above 1 feed the bloom pass.
const PANEL = new THREE.PlaneGeometry(1.2, 0.3).rotateX(Math.PI / 2)
const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(3.2), toneMapped: false })
const trimMat = new THREE.MeshStandardMaterial({ color: '#d9d9d6', roughness: 0.5, metalness: 0.3 })
const TRIM = new THREE.PlaneGeometry(1.28, 0.38).rotateX(Math.PI / 2)
function CeilingPanels() {
  const spots = useMemo(() => {
    const out = []
    const { xMin, xMax, zMin, zMax } = BOUNDS
    for (let x = xMin + 1.8; x < xMax; x += 2.4)
      for (let z = zMin + 1.8; z < zMax; z += 3.6) if (!inPoly(x, z, COURTYARD) && !inPoly(x, z + 1.5, COURTYARD)) out.push([x, z])
    for (let x = EAST + 1.4; x < EAST + 9.5; x += 2.4)
      for (let z = -8; z < 8.5; z += 3.6) if (Math.hypot(x - EAST, z) < 9) out.push([x, z])
    return out
  }, [])
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
function RoomLights() {
  const spots = useMemo(() => {
    const out = DRUMS.map((d) => ({ p: [d.c[0] - d.dir[0] * 1.5, H - 0.7, d.c[1] - d.dir[1] * 1.5], i: 7, d: Math.max(d.rx, d.rz) * 2.2 }))
    const lx = (LIBRARY.x0 + LIBRARY.x1) / 2
    out.push({ p: [lx, H - 0.7, -6], i: 9, d: 14 }, { p: [lx, H - 0.7, 6], i: 9, d: 14 })
    return out
  }, [])
  return spots.map((s, i) => <pointLight key={i} position={s.p} intensity={s.i} distance={s.d} decay={1.6} color="#ffe9cf" />)
}

export default function Lighting() {
  return (
    <>
      <hemisphereLight args={['#eef2ff', '#9a8a74', 0.4]} />
      <ambientLight intensity={0.12} />
      <Sun />
      {!OFF.has('lights') && <RoomLights />}
      <CeilingPanels />
      {QUALITY !== 'low' && <ShadowSetup />}
    </>
  )
}
