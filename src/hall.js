import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const WALL_H = 5
const T = 0.4 // سمك الحايط
const DOOR_X = 30 // مكان الباب (الحايط الشرقي)
const DOOR_HALF = 2.5 // نصف عرض الباب
const QT = 2.5 // حجم لوح الكوارتز بالمتر
// أبعاد الصورة داخل الإطار بالمتر (الفتحة الداخلية للإطار الذهبي ≈ 2.8 × 2.2)
export const PIC_W = 2.7
export const PIC_H = 2.1

// ---------- قاعة السينما (غرب المتحف، تدخلها من بوابة الممر الأوسط) ----------
const GATE_HALF = 3.6 // نصف عرض بوابة السينما
const CIN = {
  xWest: -66, // الحايط الغربي (خلف الشاشة)
  xEast: -30, // حايط المتحف الغربي (فيه البوابة)
  frontFloor: -2.8, // أرضية منطقة الشاشة (أخفض من أرض المتحف)
  frontEnd: -58.8, // هنا تبدأ المدرجات
  tierD: 2.4, // عمق كل درجة
  rise: 0.35, // ارتفاع كل درجة
  tiers: 8,
  ceil: 9.5, // ارتفاع السقف
  screenW: 16,
  screenH: 9,
  screenBottom: -0.8,
}

// ارتفاع الأرض عند نقطة (x) داخل السينما: درجات تنزل من المدخل نحو الشاشة
function cinemaFloorY(x) {
  if (x <= CIN.frontEnd) return CIN.frontFloor
  if (x >= CIN.frontEnd + CIN.tierD * CIN.tiers) return 0
  const k = Math.floor((x - CIN.frontEnd) / CIN.tierD)
  return CIN.frontFloor + CIN.rise * (k + 1)
}
function groundY(x, z) {
  if (x > CIN.xWest && x < CIN.xEast && Math.abs(z) < 12) return cinemaFloorY(x)
  return 0
}

let seed = 11
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function toTexture(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.anisotropy = 8
  return t
}

// ======================= الخامات (Textures) =======================

function placeholderTexture() {
  const [c, g] = makeCanvas(270, 210)
  g.fillStyle = '#f4f2ee'
  g.fillRect(0, 0, 270, 210)
  g.strokeStyle = '#cfcac0'
  g.lineWidth = 6
  g.setLineDash([14, 10])
  g.strokeRect(12, 12, 246, 186)
  g.setLineDash([])
  g.fillStyle = '#bdb7ab'
  g.fillRect(125, 75, 20, 60)
  g.fillRect(105, 95, 60, 20)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// رخام فاتح مع عروق وخطوط ذهبية بين البلاط
function marbleTexture() {
  const [c, g] = makeCanvas(512, 512)
  const tones = ['#f2ede3', '#e6dfd0']
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      g.fillStyle = tones[(i + j) % 2]
      g.fillRect(i * 256, j * 256, 256, 256)
      for (let k = 0; k < 4; k++) {
        g.strokeStyle = `rgba(150,138,118,${0.12 + rnd() * 0.12})`
        g.lineWidth = 0.8 + rnd() * 1.4
        const x0 = i * 256 + rnd() * 256
        const y0 = j * 256 + rnd() * 256
        g.beginPath()
        g.moveTo(x0, y0)
        g.bezierCurveTo(
          x0 + rnd() * 120 - 60, y0 + rnd() * 120 - 60,
          x0 + rnd() * 160 - 80, y0 + rnd() * 160 - 80,
          x0 + rnd() * 200 - 100, y0 + rnd() * 200 - 100
        )
        g.stroke()
      }
    }
  }
  g.strokeStyle = '#c9a45a'
  g.lineWidth = 3
  for (const p of [0, 256, 512]) {
    g.beginPath()
    g.moveTo(p, 0)
    g.lineTo(p, 512)
    g.stroke()
    g.beginPath()
    g.moveTo(0, p)
    g.lineTo(512, p)
    g.stroke()
  }
  return toTexture(c, 15, 6) // كل صورة = 4 متر (بلاط 2 متر)
}

// كوارتز أبيض لامع مع نقاط فضية وعروق خفيفة
function quartzTexture() {
  const S = 256
  const [c, g] = makeCanvas(S, S)
  const base = g.createLinearGradient(0, 0, S, S)
  base.addColorStop(0, '#f6f4f0')
  base.addColorStop(0.5, '#eeebe4')
  base.addColorStop(1, '#f5f3ee')
  g.fillStyle = base
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = `rgba(170,165,155,${0.07 + rnd() * 0.07})`
    g.lineWidth = 1 + rnd() * 2.5
    const x = rnd() * S
    const y = rnd() * S
    g.beginPath()
    g.moveTo(x, y)
    g.bezierCurveTo(
      x + rnd() * 160 - 80, y + rnd() * 160 - 80,
      x + rnd() * 160 - 80, y + rnd() * 160 - 80,
      rnd() * S, rnd() * S
    )
    g.stroke()
  }
  const cols = [
    'rgba(255,255,255,0.95)',
    'rgba(255,246,222,0.85)',
    'rgba(205,200,192,0.6)',
    'rgba(160,155,148,0.35)',
    'rgba(230,226,218,0.8)',
  ]
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = cols[Math.floor(rnd() * cols.length)]
    g.beginPath()
    g.arc(rnd() * S, rnd() * S, 0.4 + rnd() * 1.1, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = 'rgba(160,154,142,0.9)' // خط الفاصل بين الألواح
  g.lineWidth = 3
  g.strokeRect(0, 0, S, S)
  return toTexture(c)
}

// سجادة حمراء بحواف ذهبية ومعينات
function carpetTexture(length) {
  const [c, g] = makeCanvas(256, 128)
  g.fillStyle = '#8a0f20'
  g.fillRect(0, 0, 256, 128)
  g.fillStyle = '#7a0b1b'
  g.fillRect(0, 18, 256, 92)
  g.fillStyle = 'rgba(0,0,0,0.06)'
  for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 256, 1)
  g.fillStyle = '#d9b24c'
  g.fillRect(0, 4, 256, 5)
  g.fillRect(0, 119, 256, 5)
  g.fillStyle = '#c79a35'
  g.fillRect(0, 13, 256, 2)
  g.fillRect(0, 113, 256, 2)
  g.strokeStyle = '#d9b24c'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(128, 24); g.lineTo(172, 64); g.lineTo(128, 104); g.lineTo(84, 64); g.closePath()
  g.stroke()
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(128, 40); g.lineTo(152, 64); g.lineTo(128, 88); g.lineTo(104, 64); g.closePath()
  g.stroke()
  g.fillStyle = '#d9b24c'
  for (const x of [0, 256]) {
    g.beginPath()
    g.arc(x, 64, 5, 0, Math.PI * 2)
    g.fill()
  }
  return toTexture(c, length / 4, 1)
}

// لافتة: رخام أسود + إطار ذهبي + كتابة ذهبية
function signTexture() {
  const [c, g] = makeCanvas(1024, 320)
  const bg = g.createLinearGradient(0, 0, 0, 320)
  bg.addColorStop(0, '#18181b')
  bg.addColorStop(1, '#0c0c0e')
  g.fillStyle = bg
  g.fillRect(0, 0, 1024, 320)
  g.strokeStyle = 'rgba(255,255,255,0.05)'
  g.lineWidth = 2
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    g.moveTo(rnd() * 300, 0)
    g.bezierCurveTo(300 + rnd() * 300, 100, 500 + rnd() * 300, 200, 700 + rnd() * 320, 320)
    g.stroke()
  }
  const gold = g.createLinearGradient(0, 0, 1024, 0)
  gold.addColorStop(0, '#8a6a22')
  gold.addColorStop(0.25, '#f1d98a')
  gold.addColorStop(0.5, '#b8902f')
  gold.addColorStop(0.75, '#f6e3a0')
  gold.addColorStop(1, '#8a6a22')
  g.strokeStyle = gold
  g.lineWidth = 8
  g.strokeRect(14, 14, 996, 292)
  g.lineWidth = 2
  g.strokeRect(30, 30, 964, 260)

  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const tg = g.createLinearGradient(0, 70, 0, 170)
  tg.addColorStop(0, '#f6e3a0')
  tg.addColorStop(0.5, '#d4af37')
  tg.addColorStop(1, '#9c7a25')
  g.fillStyle = tg
  g.font = '600 118px Georgia, "Times New Roman", serif'
  try {
    g.letterSpacing = '18px'
  } catch {}
  g.fillText('MUSEUM', 521, 120)
  try {
    g.letterSpacing = '0px'
  } catch {}

  g.fillStyle = gold
  g.fillRect(300, 189, 190, 2)
  g.fillRect(534, 189, 190, 2)
  g.save()
  g.translate(512, 190)
  g.rotate(Math.PI / 4)
  g.fillRect(-7, -7, 14, 14)
  g.restore()
  g.font = '700 58px "Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif'
  g.fillText('المتحف', 512, 244)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function plazaTexture() {
  const [c, g] = makeCanvas(256, 256)
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const v = 226 + Math.floor(rnd() * 8)
      g.fillStyle = `rgb(${v},${v - 5},${v - 14})`
      g.fillRect(i * 128, j * 128, 128, 128)
    }
  }
  g.strokeStyle = '#c9c1b0'
  g.lineWidth = 3
  for (const p of [0, 128, 256]) {
    g.beginPath()
    g.moveTo(p, 0)
    g.lineTo(p, 256)
    g.stroke()
    g.beginPath()
    g.moveTo(0, p)
    g.lineTo(256, p)
    g.stroke()
  }
  return toTexture(c, 6, 4)
}

// ستارة مخمل حمراء
function curtainTexture() {
  const [c, g] = makeCanvas(256, 256)
  for (let x = 0; x < 256; x += 32) {
    const grd = g.createLinearGradient(x, 0, x + 32, 0)
    grd.addColorStop(0, '#4a0912')
    grd.addColorStop(0.5, '#8d1424')
    grd.addColorStop(1, '#4a0912')
    g.fillStyle = grd
    g.fillRect(x, 0, 32, 256)
  }
  return toTexture(c, 2, 1)
}

// لافتة CINEMA فوق البوابة
function cinemaSignTexture() {
  const [c, g] = makeCanvas(1024, 160)
  g.fillStyle = '#0d0d10'
  g.fillRect(0, 0, 1024, 160)
  const gold = g.createLinearGradient(0, 0, 1024, 0)
  gold.addColorStop(0, '#8a6a22')
  gold.addColorStop(0.25, '#f1d98a')
  gold.addColorStop(0.5, '#b8902f')
  gold.addColorStop(0.75, '#f6e3a0')
  gold.addColorStop(1, '#8a6a22')
  g.strokeStyle = gold
  g.lineWidth = 6
  g.strokeRect(8, 8, 1008, 144)
  g.fillStyle = gold
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '700 84px Georgia, "Times New Roman", serif'
  try {
    g.letterSpacing = '14px'
  } catch {}
  g.fillText('CINEMA', 400, 84)
  try {
    g.letterSpacing = '0px'
  } catch {}
  g.font = '700 70px "Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif'
  g.fillText('السينما', 830, 84)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// الشاشة وهي فاضية
function screenPlaceholderTexture() {
  const [c, g] = makeCanvas(1024, 576)
  const bg = g.createLinearGradient(0, 0, 0, 576)
  bg.addColorStop(0, '#171923')
  bg.addColorStop(1, '#09090d')
  g.fillStyle = bg
  g.fillRect(0, 0, 1024, 576)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#d9b24c'
  g.font = '700 92px Georgia, "Times New Roman", serif'
  g.fillText('CINEMA', 512, 240)
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.font = '34px system-ui, "Segoe UI", Tahoma, sans-serif'
  g.fillText('Press the button to play a video for everyone', 512, 350)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function glowTexture() {
  const [c, g] = makeCanvas(128, 128)
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,226,170,0.85)')
  grd.addColorStop(0.5, 'rgba(255,214,150,0.28)')
  grd.addColorStop(1, 'rgba(255,200,130,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/*
  تصميم المبنى (نظرة من فوق، x يمين / z لتحت):

   z=-12 ┌───────────────────────────────┐
         │  ممر A                        │
   z=-4  ├──────  ──────────────  ──────┤   (فتحات بين الممرات)
         │  ممر B  (سقف زجاجي)           ╞══ الباب (شرق) + السجادة الحمراء
   z=4   ├──────  ──────────────  ──────┤
         │  ممر C                        │
   z=12  └───────────────────────────────┘
        x=-30                          x=30
*/
export function buildHall(scene) {
  const colliders = [] // مستطيلات تمنع المشي
  const slots = [] // أماكن اللوحات (60)
  const animations = []
  const seatSpots = [] // مقاعد السينما (للجلوس)

  const std = (color, rough = 0.8, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra })

  const M = {
    ivory: std(0xf2ede2, 0.92),
    cream: std(0xfaf7f0, 0.9),
    ceiling: std(0xf7f3ea, 0.95),
    walnut: std(0x3a2820, 0.55),
    gold: std(0xd8b04a, 0.32, { metalness: 0.45, emissive: 0x3d2d08 }),
    darkStone: std(0x2a292c, 0.45),
    frameMetal: std(0x2d2a26, 0.4, { metalness: 0.3 }),
    quartz: std(0xffffff, 0.2, { map: quartzTexture() }),
    matIvory: std(0xf4f0e6, 0.95),
    pot: std(0x1c1b1d, 0.35),
    leaf: std(0xffffff, 0.65, { side: THREE.DoubleSide }),
    hedge: std(0x2e5a37, 0.95),
    velvet: std(0x7a0f1d, 0.9),
    door: std(0x3b2a20, 0.5),
    doorInset: std(0x4d3829, 0.55),
    glass: new THREE.MeshStandardMaterial({
      color: 0xbfe4ff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.08,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    led: new THREE.MeshBasicMaterial({ color: 0xfff1cf }),
    amber: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    // خامات السينما (داكنة لأن الإضاءة هناك خافتة)
    cinWall: std(0x4a4350, 0.9),
    cinCeil: std(0x2c2933, 0.95),
    cinFloor: std(0x5a2a30, 0.95),
    seat: std(0x9a1628, 0.8),
    seatDark: std(0x1b1a1e, 0.6),
    curtain: std(0xffffff, 0.85, { map: curtainTexture() }),
    bezel: std(0x0c0c0e, 0.4),
    stepLed: new THREE.MeshBasicMaterial({ color: 0xffc27a }),
    starLed: new THREE.MeshBasicMaterial({ color: 0xaec4ff }),
  }
  const placeholderMat = new THREE.MeshStandardMaterial({ map: placeholderTexture(), roughness: 0.8 })

  // ---------- أدوات البناء ----------
  function boxGeo(sx, sy, sz, tile) {
    const g = new THREE.BoxGeometry(sx, sy, sz)
    if (tile) {
      // نضبط الـUV حتى تظهر ألواح الكوارتز بحجم ثابت
      const uv = g.attributes.uv
      const spans = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]]
      for (let f = 0; f < 6; f++) {
        const [su, sv] = spans[f]
        for (let i = 0; i < 4; i++) {
          const k = f * 4 + i
          uv.setXY(k, (uv.getX(k) * su) / tile, (uv.getY(k) * sv) / tile)
        }
      }
      uv.needsUpdate = true
    }
    return g
  }

  // نجمع القطع حسب الخامة وندمجها بقطعة وحدة (أداء أحسن)
  const batches = new Map()
  function addGeo(mat, geo) {
    if (!batches.has(mat)) batches.set(mat, [])
    batches.get(mat).push(geo)
  }
  function B(mat, cx, cy, cz, sx, sy, sz, tile) {
    const g = boxGeo(sx, sy, sz, tile)
    g.translate(cx, cy, cz)
    addGeo(mat, g)
  }
  function flush() {
    for (const [mat, list] of batches) {
      const merged = mergeGeometries(list, false)
      scene.add(new THREE.Mesh(merged, mat))
      list.forEach((g) => g.dispose())
    }
    batches.clear()
  }

  function addCollider(cx, cz, hx, hz) {
    colliders.push({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz })
  }

  // حايط: outerFace = رقم الوجه الخارجي (0=+x ,1=-x ,4=+z ,5=-z) ليتغطى بالكوارتز
  function wallBox(cx, cy, cz, sx, sy, sz, outerFace = -1, collide = true) {
    const g = boxGeo(sx, sy, sz, QT)
    let mat = M.ivory
    if (outerFace >= 0) {
      mat = Array(6).fill(M.ivory)
      mat[outerFace] = M.quartz
    }
    const m = new THREE.Mesh(g, mat)
    m.position.set(cx, cy, cz)
    scene.add(m)
    if (collide) colliders.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2 })
  }
  // صندوق بخامة مختلفة لكل وجه (faces = { رقم_الوجه: خامة })، والباقي base
  function solid(cx, cy, cz, sx, sy, sz, faces = {}, collide = true, base = M.ivory) {
    const g = boxGeo(sx, sy, sz, QT)
    const mat = Array(6).fill(base)
    for (const [k, v] of Object.entries(faces)) mat[k] = v
    const m = new THREE.Mesh(g, mat)
    m.position.set(cx, cy, cz)
    scene.add(m)
    if (collide) colliders.push({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2 })
  }
  const wallX = (z, x1, x2, ext = T, outer = -1) =>
    wallBox((x1 + x2) / 2, WALL_H / 2, z, x2 - x1 + ext, WALL_H, T, outer)
  const wallZ = (x, z1, z2, ext = T, outer = -1) =>
    wallBox(x, WALL_H / 2, (z1 + z2) / 2, T, WALL_H, z2 - z1 + ext, outer)

  // شريط/زخرفة ملصوقة على وجه حايط
  function strip(f, y, h, depth, mat, tile) {
    const off = f.n * (T / 2 + depth / 2)
    const len = f.b - f.a
    const mid = (f.a + f.b) / 2
    if (f.axis === 'x') B(mat, mid, y, f.c + off, len, h, depth, tile)
    else B(mat, f.c + off, y, mid, depth, h, len, tile)
  }

  // ---------- الأرضيات ----------
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xc9dfb0, roughness: 1 })
  // الأرض مقطوعة مكان قاعة السينما لأن أرضيتها أخفض من الأرض
  for (const [gx, gz, gw, gd] of [
    [-123, 0, 114, 360], // غرب السينما
    [75, 0, 210, 360], // شرق السينما (فيه المتحف)
    [-48, -96, 36, 168], // شمال السينما
    [-48, 96, 36, 168], // جنوب السينما
  ]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), groundMat)
    p.rotation.x = -Math.PI / 2
    p.position.set(gx, 0, gz)
    scene.add(p)
  }

  // ساحة حجرية أمام المبنى
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 16),
    new THREE.MeshStandardMaterial({ map: plazaTexture(), roughness: 0.7 })
  )
  plaza.rotation.x = -Math.PI / 2
  plaza.position.set(DOOR_X + 12, 0.01, 0)
  scene.add(plaza)

  // رخام الداخل
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 24),
    new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.35 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.02
  scene.add(floor)

  // السجادة الحمراء: من الساحة، عبر الباب، إلى آخر الممر الأوسط
  const CARPET_FROM = -39.5 // تمتد داخل ردهة السينما
  const CARPET_TO = 53
  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(CARPET_TO - CARPET_FROM, 3.2),
    new THREE.MeshStandardMaterial({ map: carpetTexture(CARPET_TO - CARPET_FROM), roughness: 0.95 })
  )
  carpet.rotation.x = -Math.PI / 2
  carpet.position.set((CARPET_FROM + CARPET_TO) / 2, 0.035, 0)
  scene.add(carpet)

  // ---------- الجدران الخارجية (الوجه الخارجي كوارتز) ----------
  wallX(-12, -30, 30, T, 5) // شمال
  wallX(12, -30, 30, T, 4) // جنوب
  // غرب: بوابة السينما بالنص (الوجه الغربي داكن لأنه داخل السينما)
  solid(-30, WALL_H / 2, (-12 - GATE_HALF) / 2, T, WALL_H, 12 - GATE_HALF, { 1: M.cinWall })
  solid(-30, WALL_H / 2, (12 + GATE_HALF) / 2, T, WALL_H, 12 - GATE_HALF, { 1: M.cinWall })
  wallBox(-30, 4.5, 0, T, 1, GATE_HALF * 2, -1, false) // فوق البوابة
  wallZ(DOOR_X, -12, -DOOR_HALF, 0, 0) // شرق (قبل الباب)
  wallZ(DOOR_X, DOOR_HALF, 12, 0, 0) // شرق (بعد الباب)
  wallBox(DOOR_X, 4.5, 0, T, 1, DOOR_HALF * 2, 0, false) // فوق الباب

  // ---------- الجدران الفاصلة بين الممرات (فيها فتحات) ----------
  const dividerSegments = [
    [-30, -15],
    [-10, 10],
    [15, 30],
  ]
  for (const z of [-4, 4]) {
    for (const [x1, x2] of dividerSegments) wallX(z, x1, x2, 0)
  }

  // ---------- السقف ----------
  const GL = 26 // نصف طول الزجاج
  // شرائح السقف الصلب
  B(M.ceiling, 0, 5.2, -8.0, 60.4, 0.4, 8.4) // فوق ممر A
  B(M.ceiling, 0, 5.2, 8.0, 60.4, 0.4, 8.4) // فوق ممر C
  B(M.ceiling, 28.1, 5.2, 0, 4.2, 0.4, 7.6) // نهاية الممر الأوسط (جهة الباب)
  B(M.ceiling, -28.1, 5.2, 0, 4.2, 0.4, 7.6) // نهاية الممر الأوسط (الغرب)

  // حافة علوية (باراپيت) من الكوارتز
  B(M.quartz, 0, 5.65, -12.05, 60.4, 0.5, 0.3, QT)
  B(M.quartz, 0, 5.65, 12.05, 60.4, 0.5, 0.3, QT)
  B(M.quartz, -30.05, 5.65, 0, 0.3, 0.5, 24.4, QT)
  B(M.quartz, 30.05, 5.65, -9.35, 0.3, 0.5, 5.7, QT)
  B(M.quartz, 30.05, 5.65, 9.35, 0.3, 0.5, 5.7, QT)

  // ---------- السقف الزجاجي فوق الممر الأوسط ----------
  const EAVE_Y = 5.4
  const RIDGE_Y = 7.1
  const HALF_W = 3.8
  const slope = Math.atan2(RIDGE_Y - EAVE_Y, HALF_W)
  const slopeLen = Math.hypot(HALF_W, RIDGE_Y - EAVE_Y)
  for (const s of [1, -1]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(GL * 2, slopeLen), M.glass)
    pane.rotation.x = -Math.PI / 2 + s * slope
    pane.position.set(0, (EAVE_Y + RIDGE_Y) / 2, (s * HALF_W) / 2)
    pane.renderOrder = 2
    scene.add(pane)
    // أضلاع الهيكل المعدني
    for (let x = -GL; x <= GL + 0.01; x += 4) {
      const rib = new THREE.BoxGeometry(0.12, 0.1, slopeLen)
      rib.rotateX(s * slope)
      rib.translate(x, (EAVE_Y + RIDGE_Y) / 2 + 0.04, (s * HALF_W) / 2)
      addGeo(M.frameMetal, rib)
    }
    B(M.frameMetal, 0, EAVE_Y + 0.05, s * (HALF_W - 0.05), GL * 2 + 0.2, 0.14, 0.18) // حافة سفلية
  }
  B(M.gold, 0, RIDGE_Y + 0.02, 0, GL * 2 + 0.2, 0.14, 0.2) // عمود السقف الذهبي
  for (const x of [-GL, GL]) {
    B(M.frameMetal, x, EAVE_Y + 0.05, 0, 0.18, 0.14, HALF_W * 2)
    B(M.frameMetal, x, (EAVE_Y + RIDGE_Y) / 2, 0, 0.12, RIDGE_Y - EAVE_Y, 0.12)
    const cap = new THREE.Mesh(
      new THREE.ShapeGeometry(
        new THREE.Shape([
          new THREE.Vector2(-HALF_W, 0),
          new THREE.Vector2(HALF_W, 0),
          new THREE.Vector2(0, RIDGE_Y - EAVE_Y),
        ])
      ),
      M.glass
    )
    cap.rotation.y = Math.PI / 2
    cap.position.set(x, EAVE_Y, 0)
    cap.renderOrder = 2
    scene.add(cap)
  }

  // ---------- زخرفة الجدران من الداخل ----------
  const inner = [
    { axis: 'x', c: -12, a: -29.8, b: 29.8, n: 1 },
    { axis: 'x', c: 12, a: -29.8, b: 29.8, n: -1 },
    { axis: 'z', c: -30, a: -11.8, b: -GATE_HALF, n: 1 },
    { axis: 'z', c: -30, a: GATE_HALF, b: 11.8, n: 1 },
    { axis: 'z', c: DOOR_X, a: -11.8, b: -DOOR_HALF, n: -1 },
    { axis: 'z', c: DOOR_X, a: DOOR_HALF, b: 11.8, n: -1 },
  ]
  for (const z of [-4, 4]) {
    for (const [a, b] of dividerSegments) {
      for (const n of [1, -1]) {
        inner.push({ axis: 'x', c: z, a: Math.max(a, -29.8), b: Math.min(b, 29.8), n })
      }
    }
  }
  for (const f of inner) {
    strip(f, 0.45, 0.9, 0.05, M.walnut) // قاعدة خشبية داكنة
    strip(f, 0.92, 0.04, 0.07, M.gold) // خط ذهبي
    strip(f, 4.75, 0.04, 0.07, M.gold) // خط ذهبي علوي
    strip(f, 4.9, 0.2, 0.14, M.cream) // كورنيش
  }

  // ---------- زخرفة الجدران من الخارج (كوارتز + ذهب) ----------
  const outer = [
    { axis: 'x', c: -12, a: -30.2, b: 30.5, n: -1 },
    { axis: 'x', c: 12, a: -30.2, b: 30.5, n: 1 },
    { axis: 'z', c: DOOR_X, a: -12.2, b: -DOOR_HALF, n: 1 },
    { axis: 'z', c: DOOR_X, a: DOOR_HALF, b: 12.2, n: 1 },
  ]
  for (const f of outer) {
    strip(f, 0.3, 0.6, 0.14, M.darkStone) // قاعدة حجرية
    strip(f, 0.63, 0.04, 0.16, M.gold)
    strip(f, 4.75, 0.5, 0.3, M.quartz, QT) // كورنيش كوارتز
    strip(f, 4.47, 0.05, 0.32, M.gold)
  }
  // أعمدة جدارية (pilasters) بنقش ذهبي
  const FIN_D = 0.28
  const fin = (x, z, nx, nz) => {
    const sx = nx ? FIN_D : 0.9
    const sz = nz ? FIN_D : 0.9
    const cx = x + nx * (0.2 + FIN_D / 2)
    const cz = z + nz * (0.2 + FIN_D / 2)
    B(M.quartz, cx, 2.22, cz, sx, 4.45, sz, QT)
    B(M.gold, x + nx * (0.2 + FIN_D + 0.015), 2.22, z + nz * (0.2 + FIN_D + 0.015), nx ? 0.03 : 0.06, 4.0, nz ? 0.03 : 0.06)
    addCollider(cx, cz, sx / 2 + 0.02, sz / 2 + 0.02)
  }
  for (let x = -22.5; x <= 22.6; x += 7.5) {
    fin(x, -12, 0, -1)
    fin(x, 12, 0, 1)
  }

  // ---------- مدخل فخم (أعمدة + لافتة فوق الباب) ----------
  const PX = DOOR_X + 1.0 // مركز الواجهة البارزة
  for (const s of [1, -1]) {
    B(M.quartz, PX, 2.5, s * 4.5, 1.6, 5, 4, QT) // عمود جانبي
    B(M.darkStone, PX, 0.3, s * 4.5, 1.8, 0.6, 4.2)
    for (const dz of [0.7, 3.3]) B(M.gold, PX + 0.82, 2.5, s * (2.5 + dz), 0.04, 4.6, 0.07)
    addCollider(PX, s * 4.5, 0.9, 2.0)
  }
  B(M.quartz, PX, 6.3, 0, 1.6, 2.6, 13, QT) // كتلة فوق الباب للافتة
  B(M.quartz, PX, 7.5, 0, 1.95, 0.2, 13.3, QT)
  B(M.gold, PX, 7.64, 0, 1.98, 0.08, 13.4)
  B(M.gold, PX, 5.04, 0, 1.62, 0.08, 13.0)

  // اللافتة
  const signBack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.5, 7.5), M.gold)
  signBack.position.set(PX + 0.84, 6.3, 0)
  scene.add(signBack)
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 2.25),
    new THREE.MeshBasicMaterial({ map: signTexture() })
  )
  sign.position.set(PX + 0.885, 6.3, 0)
  sign.rotation.y = Math.PI / 2
  scene.add(sign)

  // فوانيس جانب الباب
  for (const s of [1, -1]) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12), M.gold)
    body.position.set(PX, 3.5, s * 2.38)
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), M.amber)
    glow.position.set(PX, 3.5, s * 2.38)
    const capL = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.16, 12), M.gold)
    capL.position.set(PX, 3.84, s * 2.38)
    scene.add(body, glow, capL)
  }

  // ---------- سلوك السجادة: أعمدة وحبال مخملية ----------
  const postXs = [33, 37, 41, 45, 49, 53]
  for (const zs of [-1.95, 1.95]) {
    postXs.forEach((x, i) => {
      const base = new THREE.CylinderGeometry(0.17, 0.19, 0.05, 16)
      base.translate(x, 0.06, zs)
      const pole = new THREE.CylinderGeometry(0.03, 0.03, 0.95, 10)
      pole.translate(x, 0.52, zs)
      const top = new THREE.SphereGeometry(0.07, 10, 8)
      top.translate(x, 1.0, zs)
      addGeo(M.gold, base)
      addGeo(M.gold, pole)
      addGeo(M.gold, top)
      if (i < postXs.length - 1) {
        const x2 = postXs[i + 1]
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(x, 0.92, zs),
          new THREE.Vector3((x + x2) / 2, 0.46, zs),
          new THREE.Vector3(x2, 0.92, zs)
        )
        addGeo(M.velvet, new THREE.TubeGeometry(curve, 14, 0.022, 6, false))
      }
    })
  }

  // ---------- أحواض زينة وأشجار أمام المبنى ----------
  const urnPot = new THREE.CylinderGeometry(0.4, 0.3, 0.8, 18)
  const urnBall = new THREE.SphereGeometry(0.55, 16, 12)
  for (const x of [33.4, 41.4, 49.4]) {
    for (const z of [-4.4, 4.4]) {
      const p = urnPot.clone()
      p.translate(x, 0.4, z)
      addGeo(M.darkStone, p)
      const r = new THREE.TorusGeometry(0.4, 0.03, 8, 20)
      r.rotateX(Math.PI / 2)
      r.translate(x, 0.8, z)
      addGeo(M.gold, r)
      const t = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8)
      t.translate(x, 1.05, z)
      addGeo(M.walnut, t)
      const b = urnBall.clone()
      b.translate(x, 1.55, z)
      addGeo(M.hedge, b)
      addCollider(x, z, 0.45, 0.45)
    }
  }
  for (const z of [-8.4, 8.4]) {
    B(M.hedge, 43, 0.45, z, 21, 0.9, 0.9)
    addCollider(43, z, 10.5, 0.45)
  }
  const coneGeo = new THREE.ConeGeometry(0.95, 3.6, 14)
  for (const x of [34, 40, 46, 52]) {
    for (const z of [-9.8, 9.8]) {
      const cone = coneGeo.clone()
      cone.translate(x, 2.4, z)
      addGeo(M.hedge, cone)
      const trunk = new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8)
      trunk.translate(x, 0.3, z)
      addGeo(M.walnut, trunk)
      addCollider(x, z, 0.6, 0.6)
    }
  }

  // ---------- أماكن اللوحات: 20 لكل ممر ----------
  const pictureGeo = new THREE.PlaneGeometry(PIC_W, PIC_H)
  const hitGeo = new THREE.PlaneGeometry(3.15, 2.55)
  const hitMat = new THREE.MeshBasicMaterial({ visible: false })
  const frameMatrices = []
  let slotId = 0

  // نقطة على خط الحايط (x,z) والاتجاه العمودي (nx,nz) نحو الممر
  function addSlot(x, z, nx, nz, corridor) {
    const px = x + nx * (T / 2 + 0.03)
    const pz = z + nz * (T / 2 + 0.03)
    const group = new THREE.Group()
    group.position.set(px, 2.55, pz)
    group.rotation.y = Math.atan2(nx, nz)
    group.updateMatrix()
    frameMatrices.push(group.matrix.clone())

    const picture = new THREE.Mesh(pictureGeo, placeholderMat)
    picture.position.z = 0.045
    const hit = new THREE.Mesh(hitGeo, hitMat) // مساحة ضغط أكبر تشمل الإطار
    hit.position.z = 0.05
    group.add(picture, hit)
    scene.add(group)

    slots.push({
      id: `slot-${slotId++}`,
      corridor,
      position: new THREE.Vector3(px, 2.55, pz),
      normal: new THREE.Vector3(nx, 0, nz),
      group,
      picture,
    })
  }

  const tenOnWall = Array.from({ length: 10 }, (_, i) => -22.5 + 5 * i)
  const tenOnDivider = [-27.5, -22.5, -17.5, -7.5, -2.5, 2.5, 7.5, 17.5, 22.5, 27.5]

  // ممر A (الشمالي)
  for (const x of tenOnWall) addSlot(x, -12, 0, +1, 'A')
  for (const x of tenOnDivider) addSlot(x, -4, 0, -1, 'A')
  // ممر B (الوسط)
  for (const x of tenOnDivider) addSlot(x, -4, 0, +1, 'B')
  for (const x of tenOnDivider) addSlot(x, 4, 0, -1, 'B')
  // ممر C (الجنوبي)
  for (const x of tenOnDivider) addSlot(x, 4, 0, +1, 'C')
  for (const x of tenOnWall) addSlot(x, 12, 0, -1, 'C')

  if (slots.length !== 60) console.warn('عدد أماكن اللوحات غير متوقع:', slots.length)

  // ---------- شكل الإطار (ذهبي مرتب + ورق مقوى + لوحة اسم + إضاءة) ----------
  {
    const dark = []
    const gold = []
    const light = []
    const box = (list, w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d)
      g.translate(x, y, z)
      list.push(g)
    }
    box(dark, 3.15, 2.55, 0.06, 0, 0, 0) // خلفية
    box(dark, 1.3, 0.2, 0.03, 0, -1.55, 0.035) // لوحة الاسم
    box(gold, 1.36, 0.26, 0.06, 0, -1.55, 0) // إطار لوحة الاسم
    box(gold, 3.15, 0.15, 0.12, 0, 1.2, 0.06) // الإطار الذهبي
    box(gold, 3.15, 0.15, 0.12, 0, -1.2, 0.06)
    box(gold, 0.15, 2.25, 0.12, 1.5, 0, 0.06)
    box(gold, 0.15, 2.25, 0.12, -1.5, 0, 0.06)
    box(gold, 2.85, 0.04, 0.1, 0, 1.105, 0.05) // الحافة الداخلية
    box(gold, 2.85, 0.04, 0.1, 0, -1.105, 0.05)
    box(gold, 0.04, 2.17, 0.1, 1.405, 0, 0.05)
    box(gold, 0.04, 2.17, 0.1, -1.405, 0, 0.05)
    box(gold, 0.04, 0.04, 0.3, 0, 1.5, 0.12) // ذراع مصباح اللوحة
    box(gold, 0.1, 0.12, 0.03, 0, 1.5, -0.015)
    const bar = new THREE.CylinderGeometry(0.025, 0.025, 1.4, 10)
    bar.rotateZ(Math.PI / 2)
    bar.translate(0, 1.5, 0.27)
    gold.push(bar)
    box(light, 1.2, 0.012, 0.04, 0, 1.47, 0.27)

    const matPlane = new THREE.PlaneGeometry(2.9, 2.3)
    matPlane.translate(0, 0, 0.036)

    const parts = [
      [mergeGeometries(dark, false), M.darkStone],
      [mergeGeometries(gold, false), M.gold],
      [mergeGeometries(light, false), M.led],
      [matPlane, M.matIvory],
    ]
    for (const [geo, mat] of parts) {
      const inst = new THREE.InstancedMesh(geo, mat, frameMatrices.length)
      frameMatrices.forEach((m, i) => inst.setMatrixAt(i, m))
      inst.instanceMatrix.needsUpdate = true
      inst.frustumCulled = false
      scene.add(inst)
    }
    ;[...dark, ...gold, ...light].forEach((g) => g.dispose())
  }

  // ---------- إضاءة LED دائرية في السقف ----------
  const leds = []
  const addLed = (x, z) => leds.push({ x, z })
  for (const x of tenOnWall) {
    addLed(x, -10.6)
    addLed(x, 10.6)
  }
  for (const x of tenOnDivider) {
    addLed(x, -5.4)
    addLed(x, 5.4)
  }
  for (let x = -25; x <= 25.1; x += 5) {
    addLed(x, -8)
    addLed(x, 8)
  }
  addLed(28.1, 0)
  addLed(-27.5, 0)
  for (const z of [-1.5, 0, 1.5]) addLed(PX, z) // تحت سقف المدخل

  {
    const n = leds.length
    const bezelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 32)
    const discGeo = new THREE.CircleGeometry(0.23, 32)
    discGeo.rotateX(Math.PI / 2) // يواجه الأسفل
    const poolGeo = new THREE.CircleGeometry(1.5, 32)
    poolGeo.rotateX(-Math.PI / 2)
    const poolMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const bezels = new THREE.InstancedMesh(bezelGeo, M.gold, n)
    const discs = new THREE.InstancedMesh(discGeo, M.led, n)
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, n)
    const m = new THREE.Matrix4()
    leds.forEach((p, i) => {
      bezels.setMatrixAt(i, m.makeTranslation(p.x, 4.975, p.z))
      discs.setMatrixAt(i, m.makeTranslation(p.x, 4.945, p.z))
      pools.setMatrixAt(i, m.makeTranslation(p.x, 0.045, p.z))
    })
    for (const inst of [bezels, discs, pools]) {
      inst.frustumCulled = false
      scene.add(inst)
    }
    pools.renderOrder = 1
  }

  // ---------- النباتات: منتظمة بين الإطارات ----------
  const plantSpots = []
  const plantAt = (x, z) => {
    plantSpots.push({ x, z })
    addCollider(x, z, 0.36, 0.36)
  }
  const wallGaps = []
  for (let x = -25; x <= 25.1; x += 5) wallGaps.push(x)
  const divGaps = [-25, -20, -5, 0, 5, 20, 25]
  for (const x of wallGaps) {
    plantAt(x, -12 + T / 2 + 0.5) // ممر A: الحايط الشمالي
    plantAt(x, 12 - T / 2 - 0.5) // ممر C: الحايط الجنوبي
  }
  for (const x of divGaps) {
    plantAt(x, -4 - T / 2 - 0.5) // جهة A من الفاصل
    plantAt(x, -4 + T / 2 + 0.5) // جهة B
    plantAt(x, 4 - T / 2 - 0.5) // جهة B
    plantAt(x, 4 + T / 2 + 0.5) // جهة C
  }

  {
    const n = plantSpots.length
    const potGeo = new THREE.CylinderGeometry(0.3, 0.22, 0.62, 20)
    potGeo.translate(0, 0.31, 0)
    const rimGeo = new THREE.TorusGeometry(0.3, 0.025, 8, 24)
    rimGeo.rotateX(Math.PI / 2)
    rimGeo.translate(0, 0.62, 0)
    const leafGeo = new THREE.SphereGeometry(1, 8, 6)
    leafGeo.scale(0.1, 0.62, 0.035)
    leafGeo.translate(0, 0.62, 0)

    const defs = []
    for (let i = 0; i < 8; i++) defs.push({ tilt: 0.62, phi: (i * Math.PI) / 4 + 0.2, s: 0.85 })
    for (let i = 0; i < 5; i++) defs.push({ tilt: 0.3, phi: (i * 2 * Math.PI) / 5, s: 1.1 })
    for (let i = 0; i < 2; i++) defs.push({ tilt: 0.1, phi: i * Math.PI + 0.8, s: 1.3 })

    const pots = new THREE.InstancedMesh(potGeo, M.pot, n)
    const rims = new THREE.InstancedMesh(rimGeo, M.gold, n)
    const leaves = new THREE.InstancedMesh(leafGeo, M.leaf, n * defs.length)
    const shades = ['#2f6b3a', '#3d8a4c', '#265a31'].map((c) => new THREE.Color(c))
    const m = new THREE.Matrix4()
    const r = new THREE.Matrix4()
    let li = 0
    plantSpots.forEach((p, i) => {
      m.makeTranslation(p.x, 0, p.z)
      pots.setMatrixAt(i, m)
      rims.setMatrixAt(i, m)
      defs.forEach((d, k) => {
        m.makeTranslation(p.x, 0.55, p.z)
        m.multiply(r.makeRotationY(d.phi + (i % 2) * 0.35))
        m.multiply(r.makeRotationX(d.tilt))
        m.multiply(r.makeScale(d.s, d.s, d.s))
        leaves.setMatrixAt(li, m)
        leaves.setColorAt(li, shades[(k + i) % 3])
        li++
      })
    })
    leaves.instanceColor.needsUpdate = true
    for (const inst of [pots, rims, leaves]) {
      inst.frustumCulled = false
      scene.add(inst)
    }
  }

  // ---------- تحفة فنية بنهاية الممر الأوسط ----------
  // التحفة صارت على جنب حتى تبقى بوابة السينما مفتوحة بالنص
  B(M.darkStone, -27.5, 0.55, -2.9, 1.1, 1.1, 1.1)
  B(M.gold, -27.5, 1.12, -2.9, 1.2, 0.05, 1.2)
  addCollider(-27.5, -2.9, 0.7, 0.7)
  B(M.darkStone, -27.5, 0.55, 2.9, 1.1, 1.1, 1.1)
  B(M.gold, -27.5, 1.12, 2.9, 1.2, 0.05, 1.2)
  addCollider(-27.5, 2.9, 0.7, 0.7)
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), M.gold)
  orb.position.set(-27.5, 1.6, 2.9)
  scene.add(orb)
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.4, 0.12, 120, 16, 2, 3), M.gold)
  knot.position.set(-27.5, 1.95, -2.9)
  scene.add(knot)
  animations.push((dt) => {
    knot.rotation.y += dt * 0.5
  })

  // ---------- الباب (خشب داكن + مقابض ذهبية) ----------
  function makeDoorPanel(isLeft) {
    const gp = new THREE.Group()
    gp.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, DOOR_HALF), M.door))
    for (const s of [1, -1]) {
      for (const [y, h] of [[-0.85, 1.9], [1.15, 1.3]]) {
        const inset = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, DOOR_HALF - 0.45), M.doorInset)
        inset.position.set(s * 0.165, y, 0)
        gp.add(inset)
      }
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 12), M.gold)
      handle.position.set(s * 0.28, 0, (isLeft ? 1 : -1) * (DOOR_HALF / 2 - 0.2))
      gp.add(handle)
    }
    gp.position.set(DOOR_X, 2, ((isLeft ? -1 : 1) * DOOR_HALF) / 2)
    scene.add(gp)
    return gp
  }
  const panelL = makeDoorPanel(true)
  const panelR = makeDoorPanel(false)

  const doorCollider = {
    minX: DOOR_X - 0.2,
    maxX: DOOR_X + 0.2,
    minZ: -DOOR_HALF,
    maxZ: DOOR_HALF,
  }
  colliders.push(doorCollider)

  const door = {
    isOpen: false,
    progress: 0,
    open() {
      this.isOpen = true
    },
    // هل اللاعب قريب من الباب وهو مسكّر؟
    near(x, z) {
      return !this.isOpen && Math.hypot(x - DOOR_X, z) < 5
    },
  }

  // =================== قاعة السينما ===================
  function buildCinema() {
    const bottom = CIN.frontFloor - 0.6
    const roofTop = CIN.ceil + 0.4
    const wallH = roofTop - bottom
    const wallY = (roofTop + bottom) / 2
    const xMid = (CIN.xWest - 0.2 + CIN.xEast - 0.2) / 2
    const xLen = CIN.xEast - 0.2 - (CIN.xWest - 0.2)

    // --- الجدران والسقف (داخلها داكن، خارجها كوارتز) ---
    solid(xMid, wallY, -12, xLen, wallH, T, { 5: M.quartz }, true, M.cinWall)
    solid(xMid, wallY, 12, xLen, wallH, T, { 4: M.quartz }, true, M.cinWall)
    solid(CIN.xWest, wallY, 0, T, wallH, 24.4, { 1: M.quartz }, true, M.cinWall)
    solid(CIN.xEast, (5 + roofTop) / 2, 0, T, roofTop - 5, 24.4, { 0: M.quartz }, false, M.cinWall)
    solid((CIN.xWest + CIN.xEast) / 2, CIN.ceil + 0.2, 0, 36, 0.4, 24, {}, false, M.cinCeil)

    // --- الأرضيات والمدرجات ---
    const slab = (x0, x1, top) => B(M.cinFloor, (x0 + x1) / 2, (top - 3.4) / 2, 0, x1 - x0, top + 3.4, 23.6)
    const tierX = (k) => CIN.frontEnd + k * CIN.tierD
    const tierTop = (k) => CIN.frontFloor + CIN.rise * (k + 1)
    slab(CIN.xWest + 0.2, CIN.frontEnd, CIN.frontFloor)
    for (let k = 0; k < CIN.tiers; k++) slab(tierX(k), tierX(k + 1), tierTop(k))
    slab(tierX(CIN.tiers), CIN.xEast, 0.02) // الردهة عند البوابة

    // --- المقاعد (instanced) + ممر بالنص ---
    const seatRed = []
    const seatDark = []
    const sbox = (list, w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d)
      g.translate(x, y, z)
      list.push(g)
    }
    sbox(seatRed, 0.55, 0.12, 0.5, -0.05, 0.42, 0) // الجلسة
    sbox(seatRed, 0.12, 0.62, 0.5, 0.34, 0.8, 0) // الظهر
    sbox(seatDark, 0.3, 0.4, 0.3, 0, 0.2, 0) // القاعدة
    sbox(seatDark, 0.5, 0.06, 0.07, -0.02, 0.62, 0.285) // مساند اليد
    sbox(seatDark, 0.5, 0.06, 0.07, -0.02, 0.62, -0.285)
    const seatPos = []
    for (let k = 0; k < CIN.tiers; k++) {
      const x1 = tierX(k + 1)
      const y = tierTop(k)
      for (let i = 0; i < 15; i++) {
        const z = -10.9 + i * 0.66
        seatPos.push([x1 - 0.5, y, z], [x1 - 0.5, y, -z])
      }
      // تصادم المقاعد (الكاميرا تتجاهله: seat)
      colliders.push({ minX: x1 - 0.95, maxX: x1, minZ: -11.25, maxZ: -1.3, seat: true })
      colliders.push({ minX: x1 - 0.95, maxX: x1, minZ: 1.3, maxZ: 11.25, seat: true })
      // إضاءة أرضية صغيرة على جانبي الممر
      for (const z of [-1.45, 1.45]) B(M.stepLed, tierX(k) + 0.12, y + 0.02, z, 0.16, 0.04, 0.16)
    }
    for (const [x, y, z] of seatPos) seatSpots.push({ x, y, z })
    const mtx = new THREE.Matrix4()
    for (const [list, mat] of [
      [seatRed, M.seat],
      [seatDark, M.seatDark],
    ]) {
      const inst = new THREE.InstancedMesh(mergeGeometries(list, false), mat, seatPos.length)
      seatPos.forEach(([x, y, z], i) => inst.setMatrixAt(i, mtx.makeTranslation(x, y, z)))
      inst.instanceMatrix.needsUpdate = true
      inst.frustumCulled = false
      scene.add(inst)
    }

    // --- الشاشة + الإطار + الستائر ---
    const sx0 = CIN.xWest + 0.2 // الوجه الداخلي للحايط الغربي
    const sy = CIN.screenBottom + CIN.screenH / 2
    B(M.bezel, sx0 + 0.15, sy, 0, 0.3, CIN.screenH + 0.9, CIN.screenW + 0.9)
    const gz = CIN.screenW / 2 + 0.45
    const gy = CIN.screenH / 2 + 0.45
    B(M.gold, sx0 + 0.32, sy + gy, 0, 0.06, 0.1, CIN.screenW + 1)
    B(M.gold, sx0 + 0.32, sy - gy, 0, 0.06, 0.1, CIN.screenW + 1)
    B(M.gold, sx0 + 0.32, sy, gz, 0.06, CIN.screenH + 1, 0.1)
    B(M.gold, sx0 + 0.32, sy, -gz, 0.06, CIN.screenH + 1, 0.1)
    for (const s of [-1, 1]) B(M.curtain, sx0 + 0.3, 3.25, s * 10.15, 0.5, 12.2, 3.3)
    B(M.curtain, sx0 + 0.3, 9.1, 0, 0.5, 0.8, 17.8)

    // بقعة ضوء الشاشة على الأرض + ضوء حقيقي يضيء الشخصيات القريبة
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 9),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: 0x9ec5ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.set(-61.5, CIN.frontFloor + 0.03, 0)
    pool.renderOrder = 1
    scene.add(pool)
    const screenLight = new THREE.PointLight(0xbcd4ff, 25, 34, 2)
    screenLight.position.set(-60, 4, 0)
    scene.add(screenLight)

    // --- إضاءة خافتة: نجوم LED بالسقف + مصابيح جدارية دافئة ---
    const starGeo = new THREE.CircleGeometry(0.06, 8)
    starGeo.rotateX(Math.PI / 2)
    const stars = []
    for (let x = -64; x <= -32; x += 2.6) {
      for (let z = -10.5; z <= 10.6; z += 2.1) stars.push([x + (rnd() - 0.5) * 1.2, z + (rnd() - 0.5) * 1])
    }
    const starMesh = new THREE.InstancedMesh(starGeo, M.starLed, stars.length)
    stars.forEach(([x, z], i) => starMesh.setMatrixAt(i, mtx.makeTranslation(x, CIN.ceil - 0.02, z)))
    starMesh.instanceMatrix.needsUpdate = true
    starMesh.frustumCulled = false
    scene.add(starMesh)

    const sconceGlow = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: 0xffc27a,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const glowGeo = new THREE.PlaneGeometry(2.6, 2.6)
    for (const x of [-61, -53, -45, -37]) {
      for (const s of [-1, 1]) {
        const y = cinemaFloorY(x) + 2.4
        B(M.gold, x, y, s * 11.72, 0.22, 0.6, 0.06)
        B(M.amber, x, y, s * 11.62, 0.12, 0.4, 0.06)
        const glow = new THREE.Mesh(glowGeo, sconceGlow)
        glow.position.set(x, y, s * 11.55)
        glow.rotation.y = s < 0 ? 0 : Math.PI // يواجه داخل القاعة
        glow.renderOrder = 1
        scene.add(glow)
      }
    }

    // --- زينة البوابة (من جهة المتحف): لافتة + مصابيح ---
    const faceX = CIN.xEast + T / 2
    const gateSign = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 1),
      new THREE.MeshBasicMaterial({ map: cinemaSignTexture() })
    )
    gateSign.position.set(faceX + 0.02, 4.5, 0)
    gateSign.rotation.y = Math.PI / 2
    scene.add(gateSign)
    const bulb = new THREE.SphereGeometry(0.07, 8, 6)
    const addBulb = (y, z) => {
      const b = bulb.clone()
      b.translate(faceX + 0.05, y, z)
      addGeo(M.amber, b)
    }
    for (let z = -GATE_HALF + 0.2; z <= GATE_HALF - 0.19; z += 0.4) addBulb(3.9, z)
    for (let y = 0.5; y < 3.9; y += 0.5) {
      addBulb(y, -GATE_HALF + 0.12)
      addBulb(y, GATE_HALF - 0.12)
    }

    // --- مكان الشاشة كـ "إطار" مشترك (يرفع عليه أي زائر فيديو للكل) ---
    const group = new THREE.Group()
    group.position.set(sx0 + 0.34, sy, 0)
    group.rotation.y = Math.PI / 2 // يواجه الشرق (نحو المقاعد)
    const phMat = new THREE.MeshBasicMaterial({ map: screenPlaceholderTexture() })
    const picture = new THREE.Mesh(new THREE.PlaneGeometry(CIN.screenW, CIN.screenH), phMat)
    group.add(picture)
    scene.add(group)
    slots.push({
      id: 'cinema',
      corridor: 'Cinema',
      position: new THREE.Vector3(sx0 + 0.34, sy, 0),
      normal: new THREE.Vector3(1, 0, 0),
      group,
      picture,
      shared: true, // أي زائر يقدر يبدّل الفيديو
      nearDist: 34, // يظهر الزر من أي مكان داخل السينما
      clickDist: 45,
      picW: CIN.screenW,
      picH: CIN.screenH,
      placeholder: phMat,
      playIf: (p) => p.x < -31 && Math.abs(p.z) < 12, // الفيديو يشتغل فقط وأنت داخل السينما
    })
  }
  buildCinema()

  flush() // دمج كل القطع المجمّعة

  function update(dt) {
    if (door.isOpen && door.progress < 1) {
      door.progress = Math.min(1, door.progress + dt / 0.9)
      const e = 1 - Math.pow(1 - door.progress, 3)
      panelL.position.z = -DOOR_HALF / 2 - DOOR_HALF * e
      panelR.position.z = DOOR_HALF / 2 + DOOR_HALF * e
      if (door.progress > 0.5) {
        const i = colliders.indexOf(doorCollider)
        if (i >= 0) colliders.splice(i, 1)
      }
    }
    for (const fn of animations) fn(dt)
  }

  return {
    colliders,
    slots,
    seats: seatSpots,
    door,
    update,
    groundY, // ارتفاع الأرض (السينما أخفض)
    // أعلى ارتفاع مسموح للكاميرا (حتى ما تطلع فوق السقف)
    camMaxY(x, z) {
      if (Math.abs(z) < 12 && Math.abs(x) < 30) return 4.6
      if (Math.abs(z) < 12 && x < -30 && x > -66) return 9.0
      return 30
    },
    // 0 = إضاءة عادية، 1 = داخل السينما (إضاءة خافتة)
    darkness(x, z) {
      if (Math.abs(z) > 12.5 || x < -67) return 0
      return Math.min(1, Math.max(0, (-31 - x) / 3))
    },
    spawn: { x: DOOR_X + 12, z: 0 }, // برا المتحف قدام الباب
    bounds: { minX: -75, maxX: 75, minZ: -60, maxZ: 60 },
  }
}
