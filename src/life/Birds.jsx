import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ROOF } from '../layout.js'
import { rand, smooth, timed } from './common.js'

// Eight small birds circle above the courtyard's sky opening (the canopy leaves a 27 x 25 m hole at ROOF),
// flapping two triangle wings, and now and then one glides down to sit on the canopy rim for a few seconds.
// Two InstancedMeshes (left and right wings), 16 matrices per frame.
const N = 8
const RIM_Y = ROOF + 0.3 // top of the canopy fascia round the opening
const PERCH = [[13.75, 3.5], [13.75, -6], [-13.75, 5], [-13.75, -2.5], [4, 12.75], [-7, 12.75], [8, -12.75], [-3, -12.75]]

const WING = (() => {
  // one wing in the bird's frame: root along the body (z), tip out along +x
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.09, 0, 0, -0.07, 0.24, 0, -0.03], 3))
  g.computeVertexNormals()
  return g
})()
const MAT = new THREE.MeshStandardMaterial({ color: '#2e2f33', roughness: 0.8, side: THREE.DoubleSide })

const M = new THREE.Matrix4()
const W = new THREE.Matrix4()
const Q = new THREE.Quaternion()
const E = new THREE.Euler()
const L = new THREE.Matrix4()
const Rm = new THREE.Matrix4()
const S = new THREE.Vector3(1.9, 1.9, 1.9) // a 0.9 m wingspan: crow-sized, so they read from the cloister
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1)

export default function Birds() {
  const left = useRef()
  const right = useRef()
  const birds = useMemo(() => {
    const r = rand(99)
    return Array.from({ length: N }, (_, i) => ({
      R: 7 + r() * 4,
      h: ROOF + 1.6 + r() * 2.2,
      w: (0.28 + r() * 0.12) * (i % 3 === 0 ? -1 : 1),
      a0: r() * Math.PI * 2,
      flap: 10 + r() * 4,
      ph: r() * 6,
      perch: null, // { spot, t0 } while landing, sitting and taking off
      next: 6 + i * 4 + r() * 8,
      pos: new THREE.Vector3(),
      yaw: 0,
    }))
  }, [])
  useLayoutEffect(() => {
    for (const m of [left.current, right.current]) m.frustumCulled = false
  }, [])
  const circle = (b, t, out) => {
    const a = b.a0 + t * b.w
    out.set(Math.cos(a) * b.R, b.h + 0.4 * Math.sin(t * 0.7 + b.ph), Math.sin(a) * b.R)
    return Math.atan2(-Math.sin(a) * b.w, Math.cos(a) * b.w) // heading along the circle
  }
  const C = useMemo(() => new THREE.Vector3(), [])
  useFrame(
    timed(({ clock }) => {
      const t = clock.elapsedTime
      birds.forEach((b, i) => {
        let flap = Math.sin(t * b.flap + b.ph) * 0.65
        let yaw = circle(b, t, C)
        b.pos.copy(C)
        if (!b.perch && t > b.next) b.perch = { spot: PERCH[(i * 3 + Math.floor(t)) % PERCH.length], t0: t, stay: 6 + (i % 4) * 2 }
        if (b.perch) {
          const { spot, t0, stay } = b.perch
          const u = t - t0
          const land = [spot[0], RIM_Y + 0.02, spot[1]]
          if (u < 3) {
            // glide down to the rim
            const k = smooth(u / 3)
            b.pos.set(C.x + (land[0] - C.x) * k, C.y + (land[1] - C.y) * k + Math.sin(k * Math.PI) * 0.6, C.z + (land[2] - C.z) * k)
            yaw = Math.atan2(land[0] - C.x, land[2] - C.z)
            flap *= 1 - 0.7 * k
          } else if (u < 3 + stay) {
            // sit, wings folded, a peck now and then
            b.pos.set(land[0], land[1] + (Math.sin(u * 2.3) > 0.95 ? 0.02 : 0), land[2])
            yaw = Math.atan2(-spot[0], -spot[1]) + 0.4 * Math.sin(u * 0.6) // looking into the courtyard
            flap = -1.25
          } else if (u < 6 + stay) {
            // take off back to the circle
            const k = smooth((u - 3 - stay) / 3)
            b.pos.set(land[0] + (C.x - land[0]) * k, land[1] + (C.y - land[1]) * k, land[2] + (C.z - land[2]) * k)
            yaw = Math.atan2(C.x - land[0], C.z - land[2])
            flap = Math.sin(t * b.flap * 1.4) * 0.8
          } else {
            b.perch = null
            b.next = t + 18 + ((i * 7) % 11)
          }
        }
        b.yaw = yaw
        M.compose(b.pos, Q.setFromEuler(E.set(0, yaw, 0)), S)
        W.makeRotationZ(flap)
        left.current.setMatrixAt(i, L.multiplyMatrices(M, W))
        right.current.setMatrixAt(i, Rm.multiplyMatrices(M, MIRROR).multiply(W))
      })
      left.current.instanceMatrix.needsUpdate = true
      right.current.instanceMatrix.needsUpdate = true
      if (import.meta.env.DEV) (window.__life ||= {}).birds = birds.map((b) => [b.pos.x, b.pos.y, b.pos.z, !!b.perch])
    }),
  )
  return (
    <>
      <instancedMesh ref={left} args={[WING, MAT, N]} />
      <instancedMesh ref={right} args={[WING, MAT, N]} />
    </>
  )
}
