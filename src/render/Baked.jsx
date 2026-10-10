// The baked building: static architecture from public/baked/building.glb (Blender detail pass +
// Cycles lightmaps, tools/bake/) replaces the procedural meshes World.jsx would draw.
// Colliders still come from layout.js; doors, characters and props stay procedural.
//
// Each mesh carries glTF extras { key, atlas, role }: `key` picks the app material from
// World.jsx useMaterials() (so the albedo, normal and roughness textures and the world-space UV
// patch stay), `atlas` picks the lightmap and AO map, which sample the second UV set (uv1).
// The lightmap holds everything except the sun's direct light: sky, bounce light, classroom
// coves and library lamps. The real-time sun still lights and shadows these surfaces, and
// shaderPatch() switches off the real-time ambient, hemisphere, point lights and diffuse
// environment for them, since the map already contains that light.
// ?bake=0 falls back to the procedural building.
import { useMemo } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import manifest from './bakedManifest.json'
import { EXPORT } from './exportGLB.js'
import Probes from './Probes.jsx'

const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
export const BAKED = params.get('bake') !== '0' && !EXPORT
const URL_BASE = `${import.meta.env.BASE_URL}baked/`
// N8AO already darkens corners on high quality; the baked AO adds contact shadow on top of
// the lightmap's own occlusion, so it runs at half strength. My judgment from the screenshots.
const AO_INTENSITY = Number(params.get('bakeao') ?? 0.5)
// exposure for the interior; tools/bake/bake.py divides its lamp and cove power by the same
// number so they keep their real-time brightness
const LM_GAIN = Number(params.get('lmgain') ?? 5.5)

const POINT_LOOP = '#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )'

function shaderPatch(sh) {
  // classroom and library point lights are in the map: skip them for baked surfaces
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(POINT_LOOP, '#if 0') + '\nirradiance = vec3( 0.0 );')
    .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( STANDARD )\niblIrradiance = vec3( 0.0 );\n#endif')
}

function bakedMaterial(src, lm, ao) {
  const m = src.clone()
  const prev = src.onBeforeCompile
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r)
    shaderPatch(sh)
  }
  const key = src.customProgramCacheKey()
  m.customProgramCacheKey = () => `${key}|baked`
  m.side = THREE.FrontSide // the bake exported both faces of double-sided surfaces as their own meshes
  m.lightMap = lm
  // the map stores light/scale in sRGB 8-bit; Cycles' value times albedo is radiance, three
  // divides lightmap irradiance by pi, hence the pi
  m.lightMapIntensity = Math.PI * manifest.scale * LM_GAIN
  m.aoMap = ao
  m.aoMapIntensity = AO_INTENSITY
  return m
}

const coveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.86, 0.68).multiplyScalar(3), toneMapped: false })

export default function BakedBuilding({ M }) {
  const { scene } = useGLTF(`${URL_BASE}building.glb`, `${import.meta.env.BASE_URL}draco/`)
  const lms = useTexture(manifest.lightmaps.map((f) => URL_BASE + f))
  const aos = useTexture(manifest.ao.map((f) => URL_BASE + f))
  const root = useMemo(() => {
    for (const t of lms) {
      t.channel = 1
      t.flipY = false
      t.colorSpace = THREE.SRGBColorSpace
    }
    for (const t of aos) {
      t.channel = 1
      t.flipY = false
    }
    const byKey = (k) => {
      const m = k.match(/^drumIn(\d)$/)
      return m ? M.drumIn[+m[1]] : M[k] || M.white
    }
    const cache = new Map()
    scene.traverse((o) => {
      if (!o.isMesh) return
      const { key, atlas } = o.userData
      o.userData.baked = true
      if (key === 'cove' || atlas < 0) {
        o.material = coveMat
        return
      }
      // each drum shell gets its own material so Probes.jsx can give it its own reflection
      const ck = /^drum_/.test(o.userData.role) ? o.userData.role : `${key}|${atlas}`
      if (!cache.has(ck)) cache.set(ck, bakedMaterial(byKey(key), lms[atlas], aos[atlas]))
      o.material = cache.get(ck)
      o.matrixAutoUpdate = false
      o.updateMatrix()
    })
    return scene
  }, [scene, lms, aos, M])
  return (
    <>
      <primitive object={root} />
      <Probes root={root} />
    </>
  )
}
