import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

// postprocessing attaches its scene depth texture to one of its two ping-pong buffers. A
// convolution pass that samples that texture while writing into the same buffer forms a
// WebGL feedback loop, and which buffer a pass writes to flips with every pass before it.
// Effects here declare EffectAttribute.DEPTH only to receive the texture, never sample it in
// the effect shader, and read this float copy instead. The copy is one fullscreen draw.
const mat = new THREE.ShaderMaterial({
  uniforms: { src: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform highp sampler2D src; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(src, vUv).r, 0.0, 0.0, 1.0); }',
  depthTest: false,
  depthWrite: false,
})
const quad = new FullScreenQuad(mat)

export class DepthCopy {
  constructor() {
    this.source = null
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
    this.texture = this.target.texture
  }
  setSize(w, h) {
    this.target.setSize(w, h)
  }
  copy(renderer) {
    if (!this.source) return
    mat.uniforms.src.value = this.source
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target)
    quad.render(renderer)
    renderer.setRenderTarget(prev)
  }
  dispose() {
    this.target.dispose()
  }
}
