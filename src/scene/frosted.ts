// Frosted window glass, cheaply. The garden is rendered into a small cube map from the middle of the room
// every couple of seconds; the glass samples a blurry mip level of it along the view direction.
// Per frame that's one textured quad, and the garden itself is never drawn in the main view (it's only
// ever seen through the glass), so this is cheaper than no glass at all.
import * as THREE from 'three'
import { config } from '../config'

export const OUTSIDE_LAYER = 1

export class FrostedGlass {
  readonly material: THREE.ShaderMaterial
  private readonly target: THREE.WebGLCubeRenderTarget
  private readonly cubeCamera: THREE.CubeCamera
  private timer = Infinity
  private dirty = true

  constructor(private readonly animated: boolean) {
    this.target = new THREE.WebGLCubeRenderTarget(config.render.glassResolution, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      // 8-bit sRGB is colour-renderable and mipmappable everywhere (half-float cube targets aren't on some GPUs).
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace,
    })
    this.cubeCamera = new THREE.CubeCamera(0.5, 900, this.target)
    this.cubeCamera.layers.set(OUTSIDE_LAYER)
    for (const cam of this.cubeCamera.children) cam.layers.set(OUTSIDE_LAYER)
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        envMap: { value: this.target.texture },
        lod: { value: config.render.glassBlur },
        haze: { value: 0.06 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform samplerCube envMap;
        uniform float lod;
        uniform float haze;
        varying vec3 vWorld;
        void main() {
          vec3 dir = normalize(vWorld - cameraPosition);
          vec3 c = textureLod(envMap, dir, lod).rgb;
          gl_FragColor = vec4(mix(c, vec3(1.0), haze), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      toneMapped: true,
    })
  }

  /** Where the cube is captured from (the middle of the room, at eye height). */
  setCenter(x: number, y: number, z: number): void {
    this.cubeCamera.position.set(x, y, z)
    this.cubeCamera.updateMatrixWorld()
    this.dirty = true
  }

  invalidate(): void {
    this.dirty = true
  }

  /** Re-captures at most every 2 s (and only once if the garden is static). */
  update(dt: number, renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    this.timer += dt
    if (!this.dirty && (!this.animated || this.timer < 2)) return
    this.timer = 0
    this.dirty = false
    this.cubeCamera.update(renderer, scene)
  }

  dispose(): void {
    this.target.dispose()
    this.material.dispose()
  }
}

/** Puts everything in the garden on the outside layer only. */
export function moveToOutsideLayer(root: THREE.Object3D): void {
  root.traverse((o) => o.layers.set(OUTSIDE_LAYER))
}
