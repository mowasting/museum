import * as THREE from 'three'
import { normalizeLook } from './look.js'

function nameLabel(name) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(0,0,0,0.55)'
  g.beginPath()
  g.roundRect(8, 8, 240, 48, 24)
  g.fill()
  g.fillStyle = '#fff'
  g.font = 'bold 28px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(name, 128, 33, 220)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
  sprite.scale.set(1.6, 0.4, 1)
  sprite.position.y = 2.6
  return sprite
}

const mat = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough })
// نفس الخامة لكن تنرسم من الجهتين (للأشكال المفتوحة مثل التنورة والعباءة)
const matD = (color, rough = 0.8) => {
  const m = mat(color, rough)
  m.side = THREE.DoubleSide
  return m
}
const darker = (m, k) => {
  m.color.multiplyScalar(k)
  return m
}

// ---------- نسيج الجواريب المشبّكة (يتكرر بدون خطوط واصلة) ----------
let _fishnet = null
function fishnetTexture() {
  if (_fishnet) return _fishnet
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const g = c.getContext('2d')
  g.clearRect(0, 0, 32, 32)
  g.strokeStyle = '#0b0b0b'
  g.lineWidth = 4
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(-2, -2)
  g.lineTo(34, 34)
  g.moveTo(-2, 34)
  g.lineTo(34, -2)
  g.stroke()
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(7, 9)
  tex.colorSpace = THREE.SRGBColorSpace
  _fishnet = tex
  return tex
}

// ---------- نسيج الشعر: خصل طولية فاتحة وغامقة (يُضرب بلون الشعر) ----------
let _hairTex = null
function hairTexture() {
  if (_hairTex) return _hairTex
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#e6e6e6'
  g.fillRect(0, 0, 128, 128)
  let s = 12345
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  for (let i = 0; i < 240; i++) {
    const v = Math.floor(110 + rand() * 145)
    g.fillStyle = `rgba(${v},${v},${v},0.6)`
    g.fillRect(rand() * 128, 0, 1 + rand() * 3, 128)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  _hairTex = tex
  return tex
}

// جسم دوراني (Lathe): pts = [[نصف القطر, الارتفاع], ...] من تحت لفوق، sz = تسطيح العمق
function lathe(pts, material, sz) {
  const geo = new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    28
  )
  const m = new THREE.Mesh(geo, material)
  m.scale.z = sz
  return m
}

// ---------- شكل الراس البشري ----------
// كرة تتحول لشكل وجه: الفك يضيق للاسفل، الذقن يبرز للامام، الجبهة اسطح
const HEAD_R = 0.27
function headGeo(female, r = HEAD_R, ps = -Math.PI / 2, pl = Math.PI * 2, ts = 0, tl = Math.PI) {
  const geo = new THREE.SphereGeometry(r, 40, 30, ps, pl, ts, tl)
  const p = geo.attributes.position
  const taper = female ? 0.33 : 0.22
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i)
    let y = p.getY(i)
    let z = p.getZ(i)
    const ny = y / HEAD_R
    const t = Math.max(0, -ny) // 0 فوق نص الراس ... 1 تحت
    x *= 0.97 * (1 - taper * Math.pow(t, 1.5))
    z *= 1 - 0.1 * t
    if (z > 0) z += 0.04 * t * t // الذقن للامام
    if (ny > 0.3 && z > 0) z *= 1 - 0.08 * (ny - 0.3) // جبهة اسطح
    y *= y < 0 ? 1.04 + 0.06 * t : 1.04
    p.setXYZ(i, x, y, z)
  }
  p.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

// شخصية مصنوعة من أشكال بسيطة، تتغير حسب look (انظر look.js)
export function createAvatar({ name, look }) {
  const L = normalizeLook(look)
  const female = L.gender === 'f'
  const longSkirt = L.outfit === 'skirt'
  const mini = L.outfit === 'miniskirt'
  const anySkirt = longSkirt || mini
  const abaya = L.outfit === 'abaya'
  const thobe = L.outfit === 'thobe'
  const robe = abaya || thobe // عباءة او ثوب: قطعة وحدة تغطي الجسم
  const hijab = L.hijab

  const root = new THREE.Group()
  const skin = mat(L.skin, 0.9)
  const top = matD(L.top, robe ? 0.9 : 0.8)
  const bottomColor = mini ? 0x111111 : L.bottom
  const bottom = matD(bottomColor)
  const hair = mat(L.hairColor, 0.7) // للحواجب
  const dark = mat(0x111111)

  const add = (geo, material, x, y, z) => {
    const m = new THREE.Mesh(geo, material)
    m.position.set(x, y, z)
    root.add(m)
    return m
  }

  // =====================================================
  // الجسم واللبس
  // =====================================================

  if (robe) {
    // ---------- عباءة / ثوب: قطعة وحدة من الكتف للارض ----------
    const pts = abaya
      ? [[0.44, 0.05], [0.4, 0.3], [0.34, 0.6], [0.29, 0.85], [0.23, 1.02], [0.2, 1.12], [0.23, 1.28], [0.235, 1.4], [0.21, 1.5], [0.17, 1.56], [0.09, 1.62]]
      : [[0.33, 0.06], [0.31, 0.4], [0.29, 0.8], [0.28, 1.0], [0.3, 1.2], [0.31, 1.38], [0.3, 1.5], [0.25, 1.58], [0.09, 1.62]]
    root.add(lathe(pts, top, abaya ? 0.86 : 0.74))
    if (abaya) {
      // حافة سفلية غامقة للعباءة
      const hem = add(new THREE.TorusGeometry(0.44, 0.014, 6, 34), darker(mat(L.top, 0.9), 0.72), 0, 0.055, 0)
      hem.rotation.x = Math.PI / 2
      hem.scale.y = 0.86
    }
  } else {
    // ---------- الحوض ----------
    const hipsPts = female
      ? [[0.235, 0.7], [0.265, 0.8], [0.25, 0.9], [0.205, 0.97]]
      : [[0.22, 0.7], [0.25, 0.8], [0.24, 0.9], [0.22, 0.97]]
    root.add(lathe(hipsPts, bottom, female ? 0.8 : 0.75))

    if (female) {
      // المؤخرة: صغيرة ومتناسقة مع الحوض
      for (const s of [-1, 1]) {
        const b = add(new THREE.SphereGeometry(0.09, 14, 10), bottom, s * 0.075, 0.84, -0.14)
        b.scale.set(1, 1.15, 0.95)
      }
    }

    // ---------- الجذع (القميص) ----------
    const torsoPts = female
      ? [[0.22, 0.92], [0.185, 1.03], [0.17, 1.1], [0.2, 1.24], [0.225, 1.36], [0.21, 1.48], [0.17, 1.56], [0.09, 1.61]]
      : [[0.235, 0.92], [0.25, 1.05], [0.275, 1.2], [0.3, 1.38], [0.3, 1.5], [0.25, 1.58], [0.09, 1.62]]
    root.add(lathe(torsoPts, top, female ? 0.72 : 0.7))

    if (female) {
      // الصدر
      for (const s of [-1, 1]) {
        const b = add(new THREE.SphereGeometry(0.098, 16, 12), top, s * 0.092, 1.3, 0.115)
        b.scale.set(1, 1.02, 0.92)
      }
    }

    // ياقة القميص
    const collar = add(new THREE.TorusGeometry(0.095, 0.022, 8, 20), darker(mat(L.top), 0.82), 0, 1.6, 0.0)
    collar.rotation.x = Math.PI / 2
    collar.scale.set(1, 0.85, 1)

    // ---------- الحزام ----------
    {
      const sz = female ? 0.8 : 0.75
      const r = female ? 0.222 : 0.226
      const belt = add(new THREE.CylinderGeometry(r, r, 0.045, 24, 1, true), matD(0x1b1b1b, 0.5), 0, 0.965, 0)
      belt.scale.z = sz
      add(new THREE.BoxGeometry(0.05, 0.05, 0.012), mat(0xd4af37, 0.3), 0, 0.965, r * sz + 0.004)
    }

    // ---------- التنورة ----------
    if (mini) {
      // قصيرة: تلتصق بالخصر وتتسع تدريجياً لحد نص الفخذ (نفس عرض الحوض عند الاعلى)
      root.add(lathe([[0.37, 0.62], [0.335, 0.73], [0.29, 0.84], [0.255, 0.92], [0.226, 0.965]], matD(0x111111, 0.65), 0.84))
      const hem = add(new THREE.TorusGeometry(0.37, 0.011, 6, 34), matD(0x2a2a2a, 0.5), 0, 0.62, 0)
      hem.rotation.x = Math.PI / 2
      hem.scale.y = 0.84
    } else if (longSkirt) {
      root.add(lathe([[0.45, 0.45], [0.38, 0.62], [0.31, 0.82], [0.26, 0.93], [0.226, 0.965]], bottom, 0.9))
    }
  }

  // ---------- الأرجل ----------
  const legX = female ? 0.115 : 0.135
  const legTop = 0.115
  const legBot = female ? 0.055 : 0.075
  const bareLegs = anySkirt // الارجل ظاهرة (جلد) بالتنورة
  const legMat = robe ? top : bareLegs ? skin : bottom
  const fishnet = mini
    ? new THREE.MeshStandardMaterial({
        map: fishnetTexture(),
        transparent: true,
        alphaTest: 0.2,
        roughness: 0.9,
      })
    : null
  const shoeMat = mat(L.shoes, 0.6)
  // نعل غامق للأحذية الفاتحة ونعل فاتح للغامقة
  const soleLight = parseInt(L.shoes.slice(1, 3), 16) * 0.3 + parseInt(L.shoes.slice(3, 5), 16) * 0.6 + parseInt(L.shoes.slice(5, 7), 16) * 0.1 > 128
  const soleMat = mat(soleLight ? 0x8a8a8a : 0xf2f2f2, 0.7)

  const leg = (x) => {
    const pivot = new THREE.Group()
    pivot.position.set(x, 0.8, 0)

    const legMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        bareLegs ? legTop * 0.95 : legTop + 0.01,
        bareLegs ? legBot : legBot + 0.012,
        0.75,
        16
      ),
      legMat
    )
    legMesh.position.y = -0.375
    pivot.add(legMesh)

    if (fishnet) {
      const net = new THREE.Mesh(
        new THREE.CylinderGeometry(legTop * 0.95 + 0.006, legBot + 0.006, 0.75, 16, 1, true),
        fishnet
      )
      net.position.y = -0.375
      pivot.add(net)
      // حزام الجورب (الدانتيل) تحت حافة التنورة
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.103, 0.1, 0.03, 16, 1, true), matD(0x0b0b0b, 0.6))
      band.position.y = -0.2
      pivot.add(band)
    }

    // الحذاء: جسم مدوّر + نعل
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), shoeMat)
    foot.scale.set(female ? 0.095 : 0.11, 0.07, 0.19)
    foot.position.set(0, -0.69, 0.06)
    pivot.add(foot)
    const sole = new THREE.Mesh(new THREE.BoxGeometry(female ? 0.17 : 0.2, 0.028, 0.37), soleMat)
    sole.position.set(0, -0.735, 0.07)
    pivot.add(sole)

    root.add(pivot)
    return pivot
  }
  const legL = leg(-legX)
  const legR = leg(legX)

  // ---------- الأذرع ----------
  const armX = robe ? (abaya ? 0.27 : 0.365) : female ? 0.27 : 0.365
  const k = female ? 0.88 : 1
  const arm = (x) => {
    const pivot = new THREE.Group()
    pivot.position.set(x, 1.55, 0)
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075 * k + 0.005, 14, 10), top)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.056 * k, 12, 10), skin)
    hand.position.y = -0.62
    hand.scale.set(0.9, 1.15, 0.8)
    if (robe) {
      // كم طويل لحد الرسغ (واسع شوي بالعباءة)
      const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(abaya ? 0.08 : 0.07, abaya ? 0.105 : 0.06, 0.58, 16),
        top
      )
      sleeve.position.y = -0.29
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 10), skin)
      wrist.position.y = -0.59
      pivot.add(shoulder, sleeve, wrist, hand)
    } else {
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.065 * k, 0.057 * k, 0.3, 14), top)
      upper.position.y = -0.15
      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06 * k, 0.06 * k, 0.025, 14),
        darker(mat(L.top), 0.82)
      )
      cuff.position.y = -0.295
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.052 * k, 0.042 * k, 0.3, 14), skin)
      lower.position.y = -0.45
      pivot.add(shoulder, upper, cuff, lower, hand)
    }
    root.add(pivot)
    return pivot
  }
  const armL = arm(-armX)
  const armR = arm(armX)

  // ---------- الرقبة ----------
  add(new THREE.CylinderGeometry(0.058, 0.068, 0.22, 14), skin, 0, 1.68, 0)

  // =====================================================
  // الراس والوجه
  // =====================================================

  const HC = 1.85 // مركز الراس
  add(headGeo(female), skin, 0, HC, 0)

  // الاذنين
  for (const s of [-1, 1]) {
    const ear = add(new THREE.SphereGeometry(0.045, 10, 8), skin, s * 0.258, 1.85, -0.005)
    ear.scale.set(0.45, 1, 0.75)
  }

  // ---------- العيون ----------
  const eyeWhite = mat(0xf7f7f7, 0.25)
  const iris = mat(L.eyeColor, 0.25)
  const pupil = mat(0x050505, 0.2)
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const lineMat = mat(female ? 0x0e0e0e : 0x1a1a1a, 0.6)
  for (const ex of [-0.098, 0.098]) {
    const sgn = ex < 0 ? -1 : 1 // الاتجاه للخارج (بعيد عن الانف)
    const white = add(new THREE.SphereGeometry(0.046, 14, 10), eyeWhite, ex, 1.875, 0.236)
    white.scale.set(1.2, female ? 0.72 : 0.64, 0.5) // شكل لوزي مو دائرة
    const ir = add(new THREE.SphereGeometry(0.03, 12, 10), iris, ex, 1.875, 0.255)
    ir.scale.set(1, female ? 1.05 : 0.98, 0.4)
    const pu = add(new THREE.SphereGeometry(0.0155, 10, 8), pupil, ex, 1.875, 0.262)
    pu.scale.z = 0.5
    const gl = add(new THREE.SphereGeometry(0.0075, 8, 6), glint, ex + sgn * 0.008, 1.883, 0.269)
    gl.scale.z = 0.5

    // الجفن العلوي (خط): اغمق واسمك عند الانثى مع جناح للخارج
    const lid = add(new THREE.TorusGeometry(0.053, female ? 0.0085 : 0.006, 6, 14, Math.PI), lineMat, ex, 1.872, 0.252)
    lid.scale.y = 0.55
    if (female) {
      const wing = add(new THREE.BoxGeometry(0.03, 0.008, 0.008), lineMat, ex + sgn * 0.058, 1.883, 0.247)
      wing.rotation.z = sgn * 0.4
    }

    // الحاجب: قطعتين (داخلية صاعدة وخارجية نازلة) = حاجب مقوس
    const bw = female ? 0.055 : 0.062
    const bt = female ? 0.013 : 0.023
    const inner = add(new THREE.BoxGeometry(bw, bt, 0.02), hair, ex - sgn * 0.03, 1.953, 0.238)
    inner.rotation.z = sgn * (female ? 0.28 : 0.1)
    const outer = add(new THREE.BoxGeometry(bw, bt, 0.02), hair, ex + sgn * 0.03, female ? 1.957 : 1.955, 0.238)
    outer.rotation.z = -sgn * (female ? 0.3 : 0.12)
  }

  // ---------- الانف ----------
  const noseMat = mat(L.skin, 1)
  noseMat.color.multiplyScalar(0.94) // اغمق شوي من البشرة
  const ns = female ? 0.86 : 1
  const bridge = add(new THREE.SphereGeometry(0.03 * ns, 12, 10), noseMat, 0, 1.835, 0.26)
  bridge.scale.set(0.85, 1.3, 0.9)
  add(new THREE.SphereGeometry(0.019 * ns, 10, 8), noseMat, 0, 1.818, 0.275)
  for (const s of [-1, 1]) {
    const w = add(new THREE.SphereGeometry(0.014 * ns, 8, 6), noseMat, s * 0.021 * ns, 1.82, 0.258)
    w.scale.z = 0.6
  }

  // ---------- الفم ----------
  const lipBase = new THREE.Color(L.skin).lerp(new THREE.Color(0xa0504a), 0.38)
  const upperLip = add(new THREE.SphereGeometry(0.04, 14, 10), mat(female ? 0xc4515f : lipBase, 0.45), 0, 1.784, 0.254)
  upperLip.scale.set(1.15, female ? 0.4 : 0.32, 0.55)
  const lowerLip = add(new THREE.SphereGeometry(0.04, 14, 10), mat(female ? 0xd2606c : lipBase, 0.45), 0, 1.766, 0.252)
  lowerLip.scale.set(1.05, female ? 0.5 : 0.38, 0.6)
  add(new THREE.BoxGeometry(0.07, 0.005, 0.004), mat(0x5a2626, 0.6), 0, 1.7765, 0.276)

  // =====================================================
  // الشعر (المرحلة 3)
  // =====================================================

  if (!hijab) {
    const hairMat = new THREE.MeshStandardMaterial({
      color: L.hairColor,
      roughness: 0.55,
      map: hairTexture(),
      side: THREE.DoubleSide,
    })
    const H = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo, hairMat)
      m.position.set(x, y, z)
      root.add(m)
      return m
    }
    // فروة الراس (تغطي الاعلى والجوانب والخلف وتترك الجبهة)
    const scalp = (len = Math.PI / 1.9) => {
      const m = H(new THREE.SphereGeometry(0.292, 30, 14, 0, Math.PI * 2, 0, len), 0, 1.87, 0)
      m.rotation.x = -0.5 // الميلان يرفع خط الشعر قدام (جبهة مكشوفة) وينزله ورا (يغطي الرقبة)
      m.scale.set(0.99, 1.05, 1.02)
      return m
    }
    // غرّة قصيرة موزعة على الجبهة
    const fringeShort = () => {
      for (let i = -2; i <= 2; i++) {
        const m = H(new THREE.SphereGeometry(0.055, 10, 8), i * 0.065, 2.03 - Math.abs(i) * 0.012, 0.18 - Math.abs(i) * 0.03)
        m.scale.set(1, 0.55, 0.8)
        m.rotation.z = -i * 0.15
      }
    }
    // غرّة ستارة: تنفتح من النص وتنزل على الجانبين
    const curtain = () => {
      for (const s of [-1, 1]) {
        const m = H(new THREE.SphereGeometry(0.11, 12, 8), s * 0.09, 2.06, 0.15)
        m.scale.set(1.15, 0.55, 0.55)
        m.rotation.z = -s * 0.55
        const lock = H(new THREE.CapsuleGeometry(0.03, 0.15, 4, 8), s * 0.17, 1.98, 0.15)
        lock.rotation.z = s * 0.3
      }
    }
    const sideburns = () => {
      for (const s of [-1, 1]) H(new THREE.BoxGeometry(0.03, 0.11, 0.05), s * 0.238, 1.87, 0.075)
    }
    // ستارة شعر خلفية: قوس اسطواني يغطي الخلف والجوانب ويترك الوجه
    // pts = [[نصف القطر, الارتفاع]...] من فوق لتحت، تنتهي بطرف مدور. يغطي الخلف والجوانب ويترك الوجه
    const hairBack = (pts, phiStart = Math.PI * 0.35, phiLen = Math.PI * 1.3, sz = 0.92) => {
      const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 34, phiStart, phiLen)
      const m = H(g, 0, 0, 0)
      m.scale.z = sz
      return m
    }

    switch (L.hairStyle) {
      case 'short':
        scalp()
        fringeShort()
        sideburns()
        break
      case 'sidepart': {
        scalp()
        const sw = (x, y, z, sx, sy, rz) => {
          const m = H(new THREE.SphereGeometry(0.08, 12, 8), x, y, z)
          m.scale.set(sx, sy, 0.6)
          m.rotation.z = rz
        }
        sw(-0.02, 2.06, 0.17, 1.7, 0.6, -0.25)
        sw(-0.12, 2.01, 0.165, 1.1, 0.7, -0.6)
        sw(0.09, 2.07, 0.15, 1.1, 0.55, 0.15)
        sideburns()
        break
      }
      case 'spiky': {
        scalp(Math.PI / 2.1)
        const N = 64
        const q = new THREE.Vector3(0, 1, 0)
        for (let i = 0; i < N; i++) {
          const y = 1 - ((i + 0.5) / N) * 2
          const r = Math.sqrt(1 - y * y)
          const th = i * 2.399963
          const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r)
          if (d.y < 0.12 || (d.z > 0.3 && d.y < 0.55)) continue
          const h = 0.15 + ((i * 5) % 4) * 0.025
          const c = H(new THREE.ConeGeometry(0.062, h, 7), d.x * (0.27 + h / 2), 1.87 + d.y * (0.27 + h / 2), d.z * (0.27 + h / 2) - 0.01)
          c.quaternion.setFromUnitVectors(q, d)
        }
        sideburns()
        break
      }
      case 'curly': {
        scalp()
        // عناقيد كيرلي موزعة على الراس (من فوق وحول وورا) وتترك الوجه مكشوف
        const N = 110
        const dirs = []
        for (let i = 0; i < N; i++) {
          const y = 1 - ((i + 0.5) / N) * 2
          const r = Math.sqrt(1 - y * y)
          const th = i * 2.399963
          const d = [Math.cos(th) * r, y, Math.sin(th) * r] // x, y, z (z موجب = الوجه)
          const faceZone = d[2] > 0.3 && d[1] < 0.5
          const lowZone = d[1] < -0.15 && !(d[2] < -0.2 && d[1] > -0.6) // نسمح بكيرلي نازل ورا الراس
          if (!faceZone && !lowZone) dirs.push(d)
        }
        const curls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), hairMat, dirs.length)
        const tmp = new THREE.Object3D()
        dirs.forEach((d, i) => {
          const s = 0.085 + ((i * 7) % 3) * 0.01
          tmp.position.set(d[0] * 0.285, d[1] * 0.285, d[2] * 0.285)
          tmp.scale.set(s, s, s)
          tmp.updateMatrix()
          curls.setMatrixAt(i, tmp.matrix)
        })
        curls.instanceMatrix.needsUpdate = true
        curls.frustumCulled = false
        curls.position.set(0, 1.9, -0.02)
        root.add(curls)
        break
      }
      case 'long': {
        // ناعم ومستقيم: وراء الاذنين وغرة ستارة
        scalp()
        curtain()
        hairBack([[0.28, 1.95], [0.29, 1.8], [0.285, 1.55], [0.265, 1.3], [0.22, 1.1], [0.12, 1.0], [0.0, 0.97]])
        break
      }
      case 'open': {
        // شعر مفتوح: كثيف وطويل، ينزل خلف الظهر وقدام الكتفين مع غرة ستارة
        scalp()
        curtain()
        hairBack([[0.285, 1.95], [0.315, 1.78], [0.335, 1.55], [0.345, 1.3], [0.33, 1.1], [0.28, 0.98], [0.16, 0.92], [0.0, 0.9]], Math.PI * 0.3, Math.PI * 1.4)
        // خصل قدام الكتفين
        for (const s of [-1, 1]) {
          const lock = H(new THREE.SphereGeometry(0.075, 12, 10), s * 0.2, 1.52, 0.15)
          lock.scale.set(0.6, 2.4, 0.45)
          lock.rotation.z = s * 0.1
        }
        break
      }
      case 'ponytail': {
        scalp()
        curtain()
        const tie = H(new THREE.TorusGeometry(0.06, 0.016, 6, 14), 0, 2.0, -0.265)
        tie.rotation.x = 1.0
        const seg = (y, z, rx, r, len) => {
          const m = H(new THREE.CapsuleGeometry(r, len, 4, 10), 0, y, z)
          m.rotation.x = rx
        }
        seg(2.0, -0.34, 1.0, 0.065, 0.14)
        seg(1.89, -0.43, 0.5, 0.068, 0.2)
        seg(1.7, -0.46, 0.1, 0.052, 0.22)
        break
      }
      case 'bun': {
        scalp()
        curtain()
        const bun = H(new THREE.SphereGeometry(0.13, 16, 12), 0, 2.17, -0.07)
        bun.scale.set(1, 0.9, 1)
        const knot = H(new THREE.TorusGeometry(0.115, 0.018, 6, 18), 0, 2.075, -0.07)
        knot.rotation.x = Math.PI / 2
        break
      }
      case 'braid': {
        scalp()
        curtain()
        // ضفيرة طويلة خلف الظهر: كرات مضغوطة متناوبة
        for (let i = 0; i < 8; i++) {
          const m = H(new THREE.SphereGeometry(0.072 - i * 0.003, 10, 8), (i % 2 ? 1 : -1) * 0.014, 1.78 - i * 0.12, -0.275 + i * 0.016)
          m.scale.set(1, 0.95, 0.85)
          m.rotation.z = (i % 2 ? 1 : -1) * 0.5
        }
        const tie = H(new THREE.TorusGeometry(0.045, 0.012, 6, 12), 0, 0.84, -0.15)
        tie.rotation.x = Math.PI / 2
        break
      }
      case 'bob': {
        // كاريه: يوصل للفك مع غرة مستقيمة
        scalp()
        hairBack([[0.285, 1.92], [0.31, 1.78], [0.315, 1.66], [0.285, 1.58], [0.16, 1.55], [0.0, 1.54]], Math.PI * 0.3, Math.PI * 1.4, 0.95)
        const bangs = H(new THREE.CapsuleGeometry(0.05, 0.23, 4, 10), 0, 2.03, 0.19)
        bangs.rotation.z = Math.PI / 2
        bangs.scale.set(1, 1, 0.8)
        break
      }
      default: // bald
        break
    }
  }

  // =====================================================
  // الحجاب (مع العباءة)
  // =====================================================
  if (hijab) {
    const hc = (ps, pl, ts, tl) => {
      const m = add(new THREE.SphereGeometry(0.29, 32, 18, ps, pl, ts, tl), top, 0, 1.86, -0.012)
      m.scale.set(1, 1.06, 1.04)
      return m
    }
    hc(-Math.PI / 2, Math.PI * 2, 0, Math.PI * 0.3) // الاعلى
    // الجوانب والخلف: يترك فتحة الوجه (±0.62 راديان من الامام)
    hc(Math.PI / 2 + 0.62, Math.PI * 2 - 1.24, Math.PI * 0.3, Math.PI * 0.68)
    // الكتفين والصدر
    root.add(lathe([[0.1, 1.8], [0.17, 1.66], [0.24, 1.58], [0.3, 1.46], [0.315, 1.28], [0.29, 1.1], [0.24, 1.0]], top, 0.88))
    // اطراف تحت الخدين تخلي فتحة الوجه بيضوية
    for (const s of [-1, 1]) {
      const c = add(new THREE.SphereGeometry(0.1, 12, 10), top, s * 0.19, 1.7, 0.1)
      c.scale.set(0.75, 1.3, 1)
    }
  }

  // =====================================================
  // اللحية (للذكر)
  // =====================================================
  if (L.beard !== 'none') {
    const beardMat = new THREE.MeshStandardMaterial({
      color: L.hairColor,
      roughness: 0.85,
      map: hairTexture(),
      side: THREE.DoubleSide,
    })
    const stubbleMat = mat(new THREE.Color(L.skin).lerp(new THREE.Color(L.hairColor), 0.4), 1)
    // قشرة بنفس شكل الراس بين زوايا معينة (phi: افقي، theta: عمودي)
    const shell = (rs, ps, pl, ts, tl, m) => add(headGeo(female, HEAD_R * rs, ps, pl, ts, tl), m, 0, HC, 0)
    const F = Math.PI / 2 // اتجاه الوجه
    const mustache = (w = 1) => {
      for (const s of [-1, 1]) {
        const m = add(new THREE.CapsuleGeometry(0.012 * w, 0.05, 4, 8), beardMat, s * 0.032, 1.797, 0.266)
        m.rotation.z = Math.PI / 2 - 0.3 * s
        m.scale.z = 0.7
      }
    }
    const sidesAndChin = (rs, sideStart, chinSpan, chinStartTheta) => {
      shell(rs, F + sideStart, 1.1, Math.PI * 0.55, Math.PI * 0.45, beardMat)
      shell(rs, F - sideStart - 1.1, 1.1, Math.PI * 0.55, Math.PI * 0.45, beardMat)
      shell(rs + 0.005, F - chinSpan / 2, chinSpan, Math.PI * chinStartTheta, Math.PI * (1 - chinStartTheta), beardMat)
    }
    switch (L.beard) {
      case 'stubble':
        shell(1.014, F - 1.45, 2.9, Math.PI * 0.58, Math.PI * 0.42, stubbleMat)
        break
      case 'mustache':
        mustache()
        break
      case 'goatee': {
        mustache()
        shell(1.05, F - 0.5, 1.0, Math.PI * 0.66, Math.PI * 0.34, beardMat)
        const tuft = add(new THREE.SphereGeometry(0.04, 10, 8), beardMat, 0, 1.63, 0.15)
        tuft.scale.set(1, 1.5, 0.8)
        break
      }
      case 'short':
        sidesAndChin(1.04, 0.22, 1.1, 0.66)
        mustache()
        break
      case 'full': {
        sidesAndChin(1.085, 0.2, 1.25, 0.64)
        mustache(1.3)
        const tuft = add(new THREE.SphereGeometry(0.075, 12, 10), beardMat, 0, 1.6, 0.14)
        tuft.scale.set(1, 1.5, 0.8)
        break
      }
    }
  }

  // ---------- القبعة ----------
  if (L.hat !== 'none' && !hijab) {
    const hatMat = mat(L.hatColor)
    if (L.hat === 'cap') {
      add(new THREE.SphereGeometry(0.31, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, 0, 1.92, 0)
      add(new THREE.BoxGeometry(0.3, 0.025, 0.2), hatMat, 0, 1.94, 0.3)
    } else {
      const b = add(new THREE.SphereGeometry(0.31, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, 0, 1.9, 0)
      b.scale.y = 1.25
      add(new THREE.SphereGeometry(0.06, 10, 8), hatMat, 0, 2.3, 0)
    }
  }

  // ---------- النظارة ----------
  if (L.glasses) {
    for (const gx of [-0.098, 0.098]) {
      add(new THREE.TorusGeometry(0.062, 0.008, 6, 18), dark, gx, 1.876, 0.284)
    }
    add(new THREE.BoxGeometry(0.05, 0.01, 0.01), dark, 0, 1.886, 0.286)
    for (const s of [-1, 1]) {
      const a = add(new THREE.BoxGeometry(0.008, 0.008, 0.28), dark, s * 0.212, 1.88, 0.15)
      a.rotation.y = -s * 0.384
    }
  }

  if (name) root.add(nameLabel(name))
  root.userData = { legL, legR, armL, armR, phase: 0, robe }
  return root
}

// تنظيف الذاكرة عند حذف الشخصية
export function disposeAvatar(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.isInstancedMesh) o.dispose()
    const m = o.material
    if (m) {
      // ملاحظة: نسيج الشعر والجوارب مشترك بين كل الشخصيات، dispose يحرر الذاكرة وبيرجع يتحمل تلقائياً عند الحاجة
      if (m.map) m.map.dispose()
      m.dispose()
    }
  })
}

// حركة المشي: speed = السرعة الحالية
export function animateAvatar(avatar, dt, speed) {
  const u = avatar.userData
  if (u.sit) {
    // وضعية الجلوس: الأرجل للأمام والأذرع شوي للأمام
    const ks = Math.min(1, dt * 12)
    u.legL.rotation.x += (-1.45 - u.legL.rotation.x) * ks
    u.legR.rotation.x += (-1.45 - u.legR.rotation.x) * ks
    u.armL.rotation.x += (-0.6 - u.armL.rotation.x) * ks
    u.armR.rotation.x += (-0.6 - u.armR.rotation.x) * ks
    return
  }
  const moving = speed > 0.1
  if (moving) u.phase += dt * (6 + speed * 0.8)
  // بالعباءة والثوب الخطوة اصغر حتى ما تطلع الارجل من القماش
  const amp = u.robe ? 0.28 : 0.8
  const swing = moving ? Math.sin(u.phase) * amp : 0
  const k = 1 - Math.min(1, dt * 12)
  u.legL.rotation.x = u.legL.rotation.x * k + swing * (1 - k)
  u.legR.rotation.x = u.legR.rotation.x * k - swing * (1 - k)
  u.armL.rotation.x = u.armL.rotation.x * k - swing * 0.8 * (1 - k)
  u.armR.rotation.x = u.armR.rotation.x * k + swing * 0.8 * (1 - k)
}
