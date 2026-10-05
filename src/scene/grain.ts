// Film grain: one full-screen quad drawn last, with per-pixel noise reseeded every frame. No render target,
// no extra scene pass; it ignores the camera, so it can live in the main scene.
import * as THREE from 'three'

export class FilmGrain {
  readonly mesh: THREE.Mesh
  private readonly uniforms: { uSeed: { value: number }; uAmount: { value: number } }

  constructor(amount = 0.085, private readonly animated = true) {
    this.uniforms = { uSeed: { value: 0 }, uAmount: { value: amount } }
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uSeed;
        uniform float uAmount;
        float hash(vec2 p) {
          p = fract(p * vec2(443.897, 441.423) + uSeed);
          p += dot(p, p.yx + 19.19);
          return fract((p.x + p.y) * p.x);
        }
        void main() {
          float n = hash(floor(gl_FragCoord.xy));
          // Signed grain around mid-grey so bright and dark areas both get texture.
          gl_FragColor = vec4(vec3(n), uAmount * (0.6 + 0.8 * abs(n - 0.5)));
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    this.mesh.name = 'film-grain'
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1e6
    this.mesh.matrixAutoUpdate = false
  }

  update(time: number): void {
    if (this.animated) this.uniforms.uSeed.value = (time * 7.31) % 97
  }
}
