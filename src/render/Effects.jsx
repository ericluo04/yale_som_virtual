import { EffectComposer, N8AO, Bloom, SMAA, Vignette, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { OFF, QUALITY } from './debugCam.js'

// High quality only. The composer renders the scene to a linear HDR buffer, so tone
// mapping moves out of the materials into the ToneMapping effect at the end of the chain.
// Bloom threshold 1.0 sits above any lit wall, so only the ceiling panels (3.2) and the
// brightest screen pixels bloom.
export default function Effects() {
  if (QUALITY === 'low' || OFF.has('post')) return null
  return (
    <EffectComposer multisampling={0}>
      {!OFF.has('ao') && <N8AO halfRes aoRadius={1.0} distanceFalloff={0.6} intensity={2.2} quality="performance" />}
      {!OFF.has('bloom') && <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.15} intensity={0.55} radius={0.7} />}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {!OFF.has('smaa') && <SMAA />}
      <Vignette offset={0.35} darkness={0.35} />
    </EffectComposer>
  )
}
