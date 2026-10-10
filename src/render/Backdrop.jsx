import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { BOUNDS, EAST, BEIN } from '../layout.js'
import { Trees } from './Scenery.jsx'

// What the player sees through the perimeter glass. Two layers:
//  1. far: an outdoor panorama (Poly Haven "Museumplein", CC0) on a sphere that follows the camera,
//     so its horizon of low buildings and autumn trees stays at eye level. It is an 8-bit JPG tone
//     mapped from the 2K HDR (6.5 MB as .hdr, 0.43 MB as .jpg). It covers the World's pure-sky HDRI,
//     which stays as scene.background underneath.
//  2. near: the street outside at ground level (5 m below floor 2): lawn, sidewalks, Whitney Avenue
//     to the west and a street to the north, street trees, and low brick neighbours across the road.
const BASE = import.meta.env.BASE_URL
const G = -5 // ground level relative to the floor 2 slab
const SKY_R = 450

// Lighting.jsx puts the sun at (-0.42, 1.05, 0.45), south-west. The panorama's brightest pixel sits
// at u = 0.601, so the sphere turns until that column lies under the sun's azimuth.
const SUN_AZ = Math.atan2(0.45, -0.42)
const PANO_SUN_U = 0.601
const SKY_YAW = Math.PI * 2 * PANO_SUN_U - SUN_AZ

function Sky() {
  const ref = useRef()
  const map = useLoader(THREE.TextureLoader, `${BASE}scenery/backdrop_museumplein_2k.jpg`)
  const { geo, mat } = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 4
    const g = new THREE.SphereGeometry(SKY_R, 64, 32)
    g.scale(-1, 1, 1) // seen from inside, unmirrored
    const m = new THREE.MeshBasicMaterial({ map, toneMapped: false, depthWrite: false, fog: false })
    return { geo: g, mat: m }
  }, [map])
  useFrame(({ camera }) => ref.current.position.copy(camera.position))
  return <mesh ref={ref} geometry={geo} material={mat} rotation={[0, SKY_YAW, 0]} renderOrder={-1} frustumCulled={false} userData={{ dynamic: true }} />
}

// ---------- canvas textures for the street
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.anisotropy = 8
  return t
}
let seed = 11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
function speckle(g, w, h, n, colors, size) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rnd() * colors.length) | 0]
    g.fillRect(rnd() * w, rnd() * h, size, size)
  }
}
const grassTex = () =>
  canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5c7f3a'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 9000, ['#4f7232', '#6a8e43', '#577a36', '#738f4a', '#466a2c'], 2)
  })
const concreteTex = () =>
  canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c3bfb6'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 5000, ['#b8b4ab', '#cdc9c0', '#aeaaa1'], 2)
    g.strokeStyle = '#8f8b84'
    g.lineWidth = 2
    g.strokeRect(1, 1, w - 2, h - 2) // one 1.5 m slab per tile: the joints
  })
// asphalt: kerb-side white lines and a double yellow centre line (as on Whitney Ave, photo 03).
// v runs across the road, so the stripes are rows of the canvas
const roadTex = () =>
  canvasTex(64, 512, (g, w, h) => {
    g.fillStyle = '#4a4b4d'
    g.fillRect(0, 0, w, h)
    speckle(g, w, h, 6000, ['#424345', '#545557', '#3c3d3f', '#5b5b5c'], 2)
    g.fillStyle = '#e8e6df'
    g.fillRect(0, h * 0.06, w, 4)
    g.fillRect(0, h * 0.94 - 4, w, 4)
    g.fillStyle = '#e0b52c'
    g.fillRect(0, h / 2 - 7, w, 4)
    g.fillRect(0, h / 2 + 3, w, 4)
  })

// Brick facade with sash windows, one bay (4 m wide, one 3.6 m storey) per tile. Colours sampled
// from the brick and brownstone around Whitney Avenue in the reference photos (21, exterior 03).
const facadeTex = (brick, mortar, trim) =>
  canvasTex(256, 232, (g, w, h) => {
    g.fillStyle = mortar
    g.fillRect(0, 0, w, h)
    const bh = 7
    const bw = 22
    for (let y = 0, row = 0; y < h; y += bh, row++) {
      for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
        const k = 0.88 + rnd() * 0.24
        const c = new THREE.Color(brick).multiplyScalar(k)
        g.fillStyle = `#${c.getHexString()}`
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2)
      }
    }
    // window: stone lintel and sill, white frame, glass with a sky reflection gradient
    const wx = w * 0.3
    const ww = w * 0.4
    const wy = h * 0.2
    const wh = h * 0.58
    g.fillStyle = trim
    g.fillRect(wx - 8, wy - 12, ww + 16, 12)
    g.fillRect(wx - 6, wy + wh, ww + 12, 8)
    g.fillStyle = '#e9e6de'
    g.fillRect(wx, wy, ww, wh)
    const gr = g.createLinearGradient(0, wy, 0, wy + wh)
    gr.addColorStop(0, '#8ea3b4')
    gr.addColorStop(0.55, '#3e4a55')
    gr.addColorStop(1, '#2a3038')
    g.fillStyle = gr
    g.fillRect(wx + 5, wy + 5, ww - 10, wh / 2 - 7)
    g.fillRect(wx + 5, wy + wh / 2 + 2, ww - 10, wh / 2 - 7)
    g.fillStyle = '#e9e6de'
    g.fillRect(wx + ww / 2 - 2, wy, 4, wh)
  })

// box whose side UVs run in metres / bay size, so the facade texture tiles bay by bay
function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const faceW = [d, d, w, w, w, w] // +x, -x, +y, -y, +z, -z
  const faceH = [h, h, d, d, h, h]
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, (uv.getX(k) * faceW[f]) / 4, (uv.getY(k) * faceH[f]) / 3.6)
    }
  return g
}

// neighbours across the street: [x, z, width (x), depth (z), height, palette]
const NEIGHBOURS = [
  [-82, -18, 16, 44, 15.5, 0], // brownstone museum block across Whitney Avenue (Peabody, guess)
  [-79, 31, 12, 26, 11, 1],
  [-6, -79, 34, 14, 10.8, 1], // across the north street
  [36, -77, 20, 12, 8.5, 0],
]
const PALETTES = [
  ['#7a4f3c', '#b9ac98', '#cfc5b2'],
  ['#8d4a35', '#b3a593', '#d8d2c4'],
]

// street trees: the Sapling maples mostly, a few birches and aspens, 9 to 11 m tall
const STREET = (() => {
  const out = []
  const kinds = ['maple', 'maple', 'birch', 'maple', 'aspen', 'maple', 'birch']
  const add = (x, z) => {
    const i = out.length
    const v = kinds[i % kinds.length]
    const base = v === 'maple' ? 1.05 : v === 'birch' ? 0.75 : 0.62
    out.push({ p: [x, G, z], r: i * 2.3, s: base * (0.9 + ((i * 37) % 5) * 0.05), v })
  }
  for (let z = -36; z <= 44; z += 16) add(BOUNDS.xMin - 9.3, z) // west, Whitney Avenue kerb (6)
  for (let x = -30; x <= 26; x += 14) add(x, BOUNDS.zMin - 7.3) // north kerb (5)
  for (const z of [-30, 30]) add(EAST + BEIN.terrace + 12, z) // east, past the terrace (2)
  add(-10, BOUNDS.zMax + 9) // south (1)
  return out
})()

function Street() {
  const m = useMemo(() => {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 1, ...o })
    const grass = grassTex()
    grass.repeat.set(1 / 3, 1 / 3) // world-space UVs below: one tile per 3 m
    const conc = concreteTex()
    conc.repeat.set(1 / 1.5, 1 / 1.5)
    return {
      grass: std({ map: grass }),
      conc: std({ map: conc }),
      road: std({ map: roadTex(), roughness: 0.95 }),
      roof: std({ color: '#5b5d60' }),
      cornice: std({ color: '#cfc7b6', roughness: 0.9 }),
      facades: PALETTES.map(([b, mo, t]) => std({ map: facadeTex(b, mo, t), roughness: 0.92 })),
    }
  }, [])
  const geos = useMemo(() => {
    const { xMin, zMin, zMax } = BOUNDS
    const xMax = EAST + BEIN.terrace
    const S = 350
    // ground: everything outside the building footprint (the courtyard keeps its own lawn)
    const shape = new THREE.Shape([new THREE.Vector2(-S, -S), new THREE.Vector2(S, -S), new THREE.Vector2(S, S), new THREE.Vector2(-S, S)])
    shape.holes.push(new THREE.Path([new THREE.Vector2(xMin, -zMin), new THREE.Vector2(xMin, -zMax), new THREE.Vector2(xMax, -zMax), new THREE.Vector2(xMax, -zMin)]))
    const ground = new THREE.ShapeGeometry(shape)
    ground.rotateX(-Math.PI / 2) // shape y becomes -z; UVs are the shape's metres
    const strip = (len, wid, uLen, vLen) => {
      const g = new THREE.PlaneGeometry(len, wid)
      g.rotateX(-Math.PI / 2)
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * len) / uLen, (uv.getY(i) * wid) / vLen)
      return g
    }
    return {
      ground,
      walkNS: strip(2 * S, 3, 1.5, 1.5), // runs along z once rotated
      walkEW: strip(2 * S, 3, 1.5, 1.5),
      roadNS: strip(2 * S, 12, 12, 12),
      roadEW: strip(2 * S, 10, 10, 10),
      boxes: NEIGHBOURS.map(([, , w, d, h]) => buildingGeo(w, h, d)),
    }
  }, [])
  const { xMin, zMin } = BOUNDS
  const wx = xMin - 10.5 // west sidewalk centre
  const rx = wx - 7.5 // Whitney Avenue centre
  const nz = zMin - 8.5
  const rz = nz - 6.5
  return (
    <group>
      <mesh geometry={geos.ground} material={m.grass} position={[0, G, 0]} receiveShadow />
      {/* west: lawn, sidewalk, Whitney Avenue, far sidewalk */}
      <mesh geometry={geos.walkNS} material={m.conc} position={[wx, G + 0.02, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={geos.roadNS} material={m.road} position={[rx, G + 0.01, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={geos.walkNS} material={m.conc} position={[rx - 7.5, G + 0.02, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      {/* north: sidewalk, street, far sidewalk */}
      <mesh geometry={geos.walkEW} material={m.conc} position={[0, G + 0.02, nz]} receiveShadow />
      <mesh geometry={geos.roadEW} material={m.road} position={[0, G + 0.012, rz]} receiveShadow />
      <mesh geometry={geos.walkEW} material={m.conc} position={[0, G + 0.02, rz - 6.5]} receiveShadow />
      {NEIGHBOURS.map(([x, z, w, d, h, pal], i) => (
        <group key={i} position={[x, G, z]}>
          <mesh geometry={geos.boxes[i]} material={[m.facades[pal], m.facades[pal], m.roof, m.roof, m.facades[pal], m.facades[pal]]} position={[0, h / 2, 0]} castShadow receiveShadow />
          <mesh material={m.cornice} position={[0, h + 0.2, 0]}>
            <boxGeometry args={[w + 0.5, 0.4, d + 0.5]} />
          </mesh>
        </group>
      ))}
      <Trees items={STREET} />
    </group>
  )
}

export default function Backdrop() {
  return (
    <>
      <Sky />
      <Street />
    </>
  )
}
