import * as THREE from 'three'

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
document.getElementById('app')!.append(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#f4f1ea')
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100)
camera.position.z = 3
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial({ flatShading: true }))
scene.add(cube)
renderer.setAnimationLoop((t) => {
  cube.rotation.set(t / 1000, t / 1500, 0)
  renderer.render(scene, camera)
})
;(window as unknown as { __bookshelf: unknown }).__bookshelf = {
  ready: true,
  info: () => renderer.info.render,
  async snapshot(name: string) {
    renderer.render(scene, camera)
    const res = await fetch(`__verify/snapshot?name=${encodeURIComponent(name)}`, { method: 'POST', body: renderer.domElement.toDataURL('image/png') })
    return res.json()
  },
}
