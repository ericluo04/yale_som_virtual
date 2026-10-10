import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { BOUNDS, EAST, BEIN } from '../layout.js'
import { Trees } from './Scenery.jsx'
import { SUN_DIR } from './Lighting.jsx'

// What the player sees through the perimeter glass. Two layers:
//  1. far: the sky. The Poly Haven "Kloofendal 48d Partly Cloudy (Pure Sky)" HDRI (CC0), the same
//     sky the lightmaps were baked under and the drei Environment background, as a 4K 8-bit JPG
//     (0.38 MB) on a sphere that follows the camera. Pure sky has no ground or buildings in it, so
//     nothing in it can disagree with the street geometry below or show a seam. Each channel holds
//     t = L / (1 + L) and the shader decodes L = t / (1 - t), so clouds and the sun disc keep their
//     HDR range through the ACES tone mapping. The lower hemisphere of the JPG is a flat horizon
//     haze; the ground plane covers all of it but a 1 degree band at the horizon.
//  2. near: the street outside at ground level (5 m below floor 2): lawn, raised sidewalks with
//     kerbs, Whitney Avenue to the west and a street to the north, street trees, and low brick
//     neighbours across the road with photo-scanned facades.
const BASE = import.meta.env.BASE_URL
const G = -5 // ground level relative to the floor 2 slab
const SKY_R = 450

// The sky's sun sits at u = 0.595 (48 degrees up, measured on the 2K HDR); the sphere turns until
// that column lies under the azimuth of Lighting.jsx's sun, so the sun disc, the shadows and the
// bright side of the sky agree.
const SUN_AZ = Math.atan2(SUN_DIR.z, SUN_DIR.x)
const PANO_SUN_U = 0.595
const SKY_YAW = Math.PI * 2 * PANO_SUN_U - SUN_AZ
// sky radiance scale: 1 is the HDR as shot. A blue sky is dimmer than sunlit white paving, and at
// 0.7 the sky through the courtyard reads blue next to the sunlit lawn and floors. My judgment
// from the screenshots.
const SKY_GAIN = 0.7

function Sky() {
  const ref = useRef()
  const map = useLoader(THREE.TextureLoader, `${BASE}hdri/kloofendal_48d_partly_cloudy_sky_4k.jpg`)
  const { geo, mat } = useMemo(() => {
    map.colorSpace = THREE.NoColorSpace // the encoding is linear Reinhard, not sRGB
    map.anisotropy = 4
    map.generateMipmaps = true
    const g = new THREE.SphereGeometry(SKY_R, 64, 32)
    g.scale(-1, 1, 1) // seen from inside, unmirrored
    const m = new THREE.MeshBasicMaterial({ map, depthWrite: false, fog: false })
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        `vec3 skyT = min( texture2D( map, vMapUv ).rgb, vec3( 254.0 / 255.0 ) );
        diffuseColor.rgb *= skyT / ( 1.0 - skyT ) * ${SKY_GAIN.toFixed(3)};`,
      )
    }
    return { geo: g, mat: m }
  }, [map])
  useFrame(({ camera }) => ref.current.position.copy(camera.position))
  // not flagged dynamic, so the drum reflection probes capture it (it casts and receives nothing)
  return <mesh ref={ref} geometry={geo} material={mat} rotation={[0, SKY_YAW, 0]} renderOrder={-1} frustumCulled={false} />
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

// photo textures (ambientCG, CC0): lawn, concrete sidewalk slabs, two brick facades
const texLoader = new THREE.TextureLoader()
function photo(file, srgb) {
  const t = texLoader.load(`${BASE}scenery/tex/${file}`)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}
const photoSet = (name, repeat) => {
  const set = { map: photo(`${name}_color.jpg`, true), normalMap: photo(`${name}_normal.jpg`), roughnessMap: photo(`${name}_rough.jpg`) }
  for (const t of Object.values(set)) t.repeat.set(repeat, repeat)
  return set
}

// box whose side UVs run in metres: one facade tile (six storeys by six bays) spans about 20 m
const FACADE_TILE = 20
function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const faceW = [d, d, w, w, w, w] // +x, -x, +y, -y, +z, -z
  const faceH = [h, h, d, d, h, h]
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, (uv.getX(k) * faceW[f]) / FACADE_TILE, (uv.getY(k) * faceH[f]) / FACADE_TILE)
    }
  return g
}

// neighbours across the street: [x, z, width (x), depth (z), height, palette]
const NEIGHBOURS = [
  [-82, -18, 16, 44, 16.5, 0], // brownstone block across Whitney Avenue (where the Peabody stands)
  [-79, 31, 12, 26, 13.2, 1],
  [-6, -79, 34, 14, 13.2, 1], // across the north street
  [36, -77, 20, 12, 9.9, 0],
  [62, 52, 14, 18, 9.9, 1], // low blocks east, seen past the Beinecke terrace
  [66, -46, 12, 16, 9.9, 0],
  // east, straight out of the Beinecke glass: with a pure sky and no photo horizon, this view
  // had only lawn to the horizon
  [76, 14, 16, 24, 13.2, 0],
  [82, -14, 14, 22, 16.5, 1],
]
const FACADES = ['facade_brown', 'facade_brick']

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
  for (const z of [-30, -10, 10, 30]) add(EAST + BEIN.terrace + 12, z) // east, past the terrace (4)
  add(-10, BOUNDS.zMax + 9) // south (1)
  return out
})()

const CURB = 0.14 // sidewalk and kerb height above the road and lawn

function Street() {
  const m = useMemo(() => {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 1, ...o })
    return {
      grass: std(photoSet('grass', 1 / 2.5)), // world-space UVs below: one tile per 2.5 m
      walk: std(photoSet('sidewalk', 1 / 3)),
      kerb: std({ color: '#b9b5ac', roughness: 0.9 }),
      road: std({ map: roadTex(), roughness: 0.95 }),
      roof: std({ color: '#5b5d60' }),
      cornice: std({ color: '#cfc7b6', roughness: 0.9 }),
      facades: FACADES.map((f) => std({ ...photoSet(f, 1), roughness: 1 })),
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
      walk: strip(2 * S, 3, 1, 1), // runs along x; rotated for the north-south runs
      kerb: new THREE.BoxGeometry(2 * S, CURB, 3),
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
  // a raised sidewalk: textured top plus a plain concrete body whose edge is the kerb
  const Walk = ({ p, ns }) => (
    <group position={p} rotation={[0, ns ? Math.PI / 2 : 0, 0]}>
      <mesh geometry={geos.walk} material={m.walk} position={[0, CURB + 0.002, 0]} receiveShadow />
      <mesh geometry={geos.kerb} material={m.kerb} position={[0, CURB / 2, 0]} receiveShadow />
    </group>
  )
  return (
    <group>
      <mesh geometry={geos.ground} material={m.grass} position={[0, G, 0]} receiveShadow />
      {/* west: lawn, sidewalk, Whitney Avenue (no parked cars), far sidewalk */}
      <Walk p={[wx, G, 0]} ns />
      <mesh geometry={geos.roadNS} material={m.road} position={[rx, G + 0.01, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <Walk p={[rx - 7.5, G, 0]} ns />
      {/* north: sidewalk, street, far sidewalk */}
      <Walk p={[0, G - 0.001, nz]} />
      <mesh geometry={geos.roadEW} material={m.road} position={[0, G + 0.012, rz]} receiveShadow />
      <Walk p={[0, G - 0.001, rz - 6.5]} />
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
