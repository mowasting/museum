import * as THREE from 'three'

export const HORIZON_COLOR = 0xcfe6f7

// سماء زرقاء متدرجة + غيوم بيضاء تتحرك ببطء
export function buildSky(scene) {
  // قبة السماء
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#2f78cf') // أعلى السماء
  grad.addColorStop(0.5, '#cfe6f7') // الأفق
  grad.addColorStop(1, '#cfe6f7')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
  )
  dome.renderOrder = -1
  scene.add(dome)

  // الغيوم
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    fog: false,
  })
  const puff = new THREE.SphereGeometry(1, 12, 8)
  const clusters = []
  for (let i = 0; i < 16; i++) {
    const cluster = new THREE.Group()
    const n = 4 + Math.floor(rnd() * 3)
    for (let j = 0; j < n; j++) {
      const r = 4 + rnd() * 4
      const m = new THREE.Mesh(puff, cloudMat)
      m.scale.set(r * 1.2, r * 0.55, r * 0.9)
      m.position.set(j * 5 - n * 2.5 + rnd() * 2, rnd() * 1.5, rnd() * 4)
      cluster.add(m)
    }
    cluster.position.set((rnd() - 0.5) * 320, 38 + rnd() * 25, (rnd() - 0.5) * 240)
    scene.add(cluster)
    clusters.push(cluster)
  }

  return {
    update(dt) {
      for (const cl of clusters) {
        cl.position.x += dt * 1.2
        if (cl.position.x > 170) cl.position.x = -170
      }
    },
  }
}