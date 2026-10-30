import * as THREE from 'three'
import { buildHall } from './hall.js'
import { buildSky, HORIZON_COLOR } from './sky.js'
import { createAvatar, animateAvatar, disposeAvatar } from './avatar.js'

const RADIUS = 0.45
const WALK = 4.5
const RUN = 8

// ---------- إعدادات الكاميرا (عدّل الأرقام من هنا) ----------
const CAM_DIST = 6 // بعد الكاميرا خلف الشخصية (كمبيوتر / جوال أفقي)
const CAM_DIST_PORTRAIT = 7 // بعدها لما يكون الجوال طولي
const CAM_FOV = 60
const CAM_FOV_PORTRAIT = 68 // زاوية أوسع للجوال الطولي
const CAM_LOOK_Y = 1.7 // الارتفاع الذي تنظر إليه الكاميرا (راس الشخصية تقريباً)
const CAM_PITCH_DEFAULT = 0.4 // ميلان الكاميرا للأسفل بالراديان (0 = بمستوى النظر، 1 = من فوق)
const CAM_PITCH_MIN = 0.08
const CAM_PITCH_MAX = 1.05

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

// فقاعة كلام فوق الراس (Sprite من canvas)
function makeBubble(text) {
  const S = 2 // دقة مضاعفة حتى يطلع النص واضح
  const MAXW = 340
  const font = '600 26px system-ui, "Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif'
  const c = document.createElement('canvas')
  let g = c.getContext('2d')
  g.font = font
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (g.measureText(test).width > MAXW && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  const shown = lines.slice(0, 4)
  if (lines.length > 4) shown[3] = shown[3].slice(0, -2) + '…'
  const lh = 34
  const textW = Math.min(MAXW, Math.max(...shown.map((l) => g.measureText(l).width)))
  const w = Math.ceil(textW + 36)
  const bodyH = shown.length * lh + 22
  const h = bodyH + 16 // + مكان المؤشر
  c.width = w * S
  c.height = h * S
  g = c.getContext('2d')
  g.scale(S, S)
  g.fillStyle = 'rgba(255,255,255,0.95)'
  g.strokeStyle = 'rgba(0,0,0,0.25)'
  g.lineWidth = 2
  g.beginPath()
  g.roundRect(2, 2, w - 4, bodyH - 2, 16)
  g.moveTo(w / 2 - 9, bodyH - 1)
  g.lineTo(w / 2, h - 3)
  g.lineTo(w / 2 + 9, bodyH - 1)
  g.fill()
  g.stroke()
  g.font = font
  g.fillStyle = '#16161a'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  shown.forEach((l, i) => g.fillText(l, w / 2, 11 + lh / 2 + i * lh + 4, w - 28))
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
  sprite.center.set(0.5, 0) // المؤشر السفلي هو نقطة الارتكاز
  sprite.scale.set(w / 120, h / 120, 1)
  return sprite
}

export function createWorld(canvas, joystickEl, stickEl) {
  // ---------- المشهد ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(HORIZON_COLOR)
  scene.fog = new THREE.Fog(HORIZON_COLOR, 70, 190)
  const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 400)
  let camDist = CAM_DIST
  let pitch = CAM_PITCH_DEFAULT

  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfc9bd, 1.7)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffffff, 1.3)
  sun.position.set(10, 20, 8)
  scene.add(sun)

  const sky = buildSky(scene)
  const hall = buildHall(scene)
  let dim = 0 // 0 = إضاءة عادية، 1 = داخل السينما

  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const portrait = camera.aspect < 1
    camera.fov = portrait ? CAM_FOV_PORTRAIT : CAM_FOV
    camDist = portrait ? CAM_DIST_PORTRAIT : CAM_DIST
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()

  // ---------- الإدخال ----------
  const keys = new Set()
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return
    keys.add(e.code)
    if (e.code === 'KeyE') {
      if (doorNear) api.openDoor()
      else api.toggleSit()
    }
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => keys.clear())

  let yaw = Math.PI / 2 // الكاميرا تبدأ شرق اللاعب وتطل على المتحف
  let dragging = false
  let lastX = 0
  let lastY = 0
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return
    yaw -= (e.clientX - lastX) * 0.006
    // السحب لفوق يرفع الكاميرا، ولتحت ينزلها (مستوى الكاميرا)
    pitch = Math.min(CAM_PITCH_MAX, Math.max(CAM_PITCH_MIN, pitch - (e.clientY - lastY) * 0.004))
    lastX = e.clientX
    lastY = e.clientY
  })
  const stopDrag = () => (dragging = false)
  canvas.addEventListener('pointerup', stopDrag)
  canvas.addEventListener('pointercancel', stopDrag)

  const joy = { x: 0, y: 0 }
  function updateJoy(e) {
    const r = joystickEl.getBoundingClientRect()
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
    const len = Math.hypot(dx, dy)
    if (len > 1) {
      dx /= len
      dy /= len
    }
    joy.x = dx
    joy.y = dy
    stickEl.style.transform = `translate(${dx * 35}px, ${dy * 35}px)`
  }
  function resetJoy() {
    joy.x = joy.y = 0
    stickEl.style.transform = 'translate(0,0)'
  }
  joystickEl.addEventListener('pointerdown', (e) => {
    joystickEl.setPointerCapture(e.pointerId)
    updateJoy(e)
  })
  joystickEl.addEventListener('pointermove', (e) => {
    if (e.buttons || e.pressure > 0) updateJoy(e)
  })
  joystickEl.addEventListener('pointerup', resetJoy)
  joystickEl.addEventListener('pointercancel', resetJoy)

  // ---------- الحركة والتصادم ----------
  const b = hall.bounds
  function hits(x, z, margin = RADIUS, ignoreSeats = false) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true
    for (const c of hall.colliders) {
      if (ignoreSeats && c.seat) continue
      if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin)
        return true
    }
    return false
  }

  // ---------- اللاعب المحلي ----------
  let me = null
  let net = null
  let avatar = null
  const pos = new THREE.Vector3(hall.spawn.x, 0, hall.spawn.z)
  let ry = -Math.PI / 2 // يواجه المتحف (غرباً)
  let curSpeed = 0
  let wasMoving = false
  let sendTimer = 0
  let doorNear = false
  let sitting = null // المقعد اللي جالس عليه (أو null)
  let seatNear = null // أقرب مقعد يمكن الجلوس عليه
  const camTarget = new THREE.Vector3()

  // الكاميرا خلف الشخصية، وتقرب وترتفع إذا اصطدمت بحايط
  function placeCamera(dt, snap) {
    const cp = Math.cos(pitch)
    const dx = Math.sin(yaw) * cp * camDist
    const dz = Math.cos(yaw) * cp * camDist
    const dy = Math.sin(pitch) * camDist
    // نقرّب الكاميرا من الشخصية لين تصير خارج أي حايط/نبات (لا تدخل بالحيطان أبداً)
    let t = 1
    while (t > 0 && hits(pos.x + dx * t, pos.z + dz * t, 0.35, true)) t -= 0.04
    t = Math.max(t, 0)
    // كل ما ضاق المكان ترتفع الكاميرا فوق الشخصية بدل ما تلتصق بالحايط
    let y = pos.y + CAM_LOOK_Y + dy * t + (1 - t) * 2.2
    y = Math.min(y, pos.y + hall.camMaxY(pos.x, pos.z)) // لا تطلع فوق السقف
    // أقل إزاحة أفقية صغيرة حتى لا تصير الكاميرا فوق الراس تماماً
    const h = Math.max(t, 0.04 / Math.hypot(dx, dz))
    camTarget.set(pos.x + dx * h, y, pos.z + dz * h)
    if (snap) camera.position.copy(camTarget)
    else camera.position.lerp(camTarget, 1 - Math.exp(-dt * (t < 0.999 ? 25 : 10)))
    camera.lookAt(pos.x, pos.y + CAM_LOOK_Y, pos.z)
  }

  // ---------- اللاعبين الثانيين ----------
  const remotes = new Map()
  const api = { onCountChange: null, onDoorNear: null, slots: hall.slots, scene, camera, updaters: [], getPos: () => pos }

  api.openDoor = () => {
    hall.door.open()
    doorNear = false
    api.onDoorNear?.(false)
  }

  // ---------- الجلوس على مقاعد السينما ----------
  function sitDown(s) {
    sitting = s
    pos.set(s.x - 0.05, s.y, s.z)
    ry = -Math.PI / 2 // يواجه الشاشة (غرباً)
    curSpeed = 0
    avatar.userData.sit = true
    api.onSitChange?.(true)
    sendState()
  }
  function standUp() {
    if (!sitting) return
    pos.x = sitting.x - 1.18 // يوقف قدام المقعد بالمساحة الفاضية بين الصفوف
    sitting = null
    avatar.userData.sit = false
    api.onSitChange?.(false)
    sendState()
  }
  api.toggleSit = () => {
    if (!me || !avatar) return
    if (sitting) standUp()
    else if (seatNear) sitDown(seatNear)
  }

  // ---------- فقاعات الكلام ----------
  const bubbles = new Map() // id -> { holder, sprite, until }
  function removeBubble(id) {
    const bb = bubbles.get(id)
    if (!bb) return
    bb.holder.remove(bb.sprite)
    bb.sprite.material.map?.dispose()
    bb.sprite.material.dispose()
    bubbles.delete(id)
  }
  api.showBubble = (id, text) => {
    const holder = me && id === me.id ? avatar : remotes.get(id)?.av
    if (!holder || !text) return
    removeBubble(id)
    const sprite = makeBubble(text)
    sprite.position.y = 3.0 // فوق اسم الشخصية
    holder.add(sprite)
    bubbles.set(id, { holder, sprite, until: performance.now() + 6000 })
  }

  function buildRemoteAvatar(p) {
    return createAvatar({ name: String(p.name || '?').slice(0, 16), look: p.look })
  }

  api.onRemote = (p) => {
    if (!me || !p || p.id === me.id) return
    const lookKey = JSON.stringify(p.look || null)
    let r = remotes.get(p.id)
    if (!r) {
      const av = buildRemoteAvatar(p)
      av.position.set(p.x, hall.groundY(p.x, p.z), p.z)
      av.rotation.y = p.ry || 0
      scene.add(av)
      r = { av, tx: p.x, tz: p.z, try: p.ry || 0, last: 0, lookKey }
      remotes.set(p.id, r)
      api.onCountChange?.(remotes.size + 1)
    } else if (r.lookKey !== lookKey) {
      // غيّر شكله: نعيد بناء الشخصية
      const old = r.av
      const av = buildRemoteAvatar(p)
      av.position.copy(old.position)
      av.rotation.y = old.rotation.y
      scene.remove(old)
      disposeAvatar(old)
      scene.add(av)
      r.av = av
      r.lookKey = lookKey
    }
    r.tx = p.x
    r.tz = p.z
    r.try = p.ry
    r.sit = !!p.sit
    r.av.userData.sit = r.sit
    r.last = performance.now()
  }

  api.start = (meInfo, network) => {
    me = meInfo
    net = network
    avatar = createAvatar({ name: me.name, look: me.look })
    avatar.position.copy(pos)
    avatar.rotation.y = ry
    scene.add(avatar)
    placeCamera(0, true)
    api.onCountChange?.(1)
  }

  // تغيير شكل شخصيتي بعد الحفظ من نافذة Character
  api.updateLook = (look) => {
    if (!me) return
    me.look = look
    const old = avatar
    avatar = createAvatar({ name: me.name, look })
    avatar.userData.sit = !!sitting
    avatar.position.copy(old.position)
    avatar.rotation.y = old.rotation.y
    scene.remove(old)
    disposeAvatar(old)
    scene.add(avatar)
    sendState()
  }

  function sendState() {
    net?.send({
      id: me.id,
      name: me.name,
      look: me.look,
      x: +pos.x.toFixed(2),
      z: +pos.z.toFixed(2),
      ry: +ry.toFixed(2),
      sit: sitting ? 1 : 0,
    })
  }

  function updateLocal(dt) {
    const up = keys.has('KeyW') || keys.has('ArrowUp')
    const down = keys.has('KeyS') || keys.has('ArrowDown')
    const right = keys.has('KeyD') || keys.has('ArrowRight')
    const left = keys.has('KeyA') || keys.has('ArrowLeft')
    const fwd = (up ? 1 : 0) - (down ? 1 : 0) - joy.y
    const strafe = (right ? 1 : 0) - (left ? 1 : 0) + joy.x

    // وأنت جالس: أي حركة بالمشي تقيمك، وغير هيچ تبقى جالس
    if (sitting && (Math.abs(fwd) > 0.3 || Math.abs(strafe) > 0.3)) standUp()
    if (sitting) {
      pos.y = sitting.y
      avatar.position.set(pos.x, pos.y - 0.3, pos.z)
      avatar.rotation.y = ry
      animateAvatar(avatar, dt, 0)
      placeCamera(dt, false)
      sendTimer += dt
      if (sendTimer > 1) {
        sendState()
        sendTimer = 0
      }
      wasMoving = false
      return
    }

    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const rx = Math.cos(yaw)
    const rz = -Math.sin(yaw)
    let mx = fx * fwd + rx * strafe
    let mz = fz * fwd + rz * strafe
    const len = Math.hypot(mx, mz)
    if (len > 1) {
      mx /= len
      mz /= len
    }
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight')
    const speed = running ? RUN : WALK
    const nx = pos.x + mx * speed * dt
    if (!hits(nx, pos.z)) pos.x = nx
    const nz = pos.z + mz * speed * dt
    if (!hits(pos.x, nz)) pos.z = nz
    curSpeed = Math.hypot(mx, mz) * speed

    if (len > 0.05) ry += wrapAngle(Math.atan2(mx, mz) - ry) * Math.min(1, dt * 12)
    pos.y += (hall.groundY(pos.x, pos.z) - pos.y) * Math.min(1, dt * 14) // صعود ونزول سلس على الدرجات
    avatar.position.set(pos.x, pos.y, pos.z)
    avatar.rotation.y = ry
    animateAvatar(avatar, dt, curSpeed)

    // زر الباب يظهر عند الاقتراب
    const near = hall.door.near(pos.x, pos.z)
    if (near !== doorNear) {
      doorNear = near
      api.onDoorNear?.(near)
    }

    // أقرب مقعد (داخل السينما فقط)
    let bestSeat = null
    let bestScore = 1.8
    if (pos.x < -31 && pos.x > -66 && Math.abs(pos.z) < 12) {
      const sfx = Math.sin(ry)
      const sfz = Math.cos(ry)
      for (const s of hall.seats) {
        const dx = s.x - pos.x
        const dz = s.z - pos.z
        const d = Math.hypot(dx, dz)
        if (d > 2.4) continue
        const score = d - 0.6 * ((dx * sfx + dz * sfz) / (d || 1)) // المقعد اللي قدامك أفضل
        if (score < bestScore) {
          bestScore = score
          bestSeat = s
        }
      }
    }
    if (bestSeat !== seatNear) {
      seatNear = bestSeat
      api.onSeatNear?.(!!bestSeat)
    }

    placeCamera(dt, false)

    // إرسال المكان للباقين
    sendTimer += dt
    const moving = curSpeed > 0.1
    if ((moving && sendTimer > 0.1) || (wasMoving && !moving) || sendTimer > 1) {
      sendState()
      sendTimer = 0
    }
    wasMoving = moving
  }

  function updateRemotes(dt) {
    const now = performance.now()
    for (const [id, r] of remotes) {
      if (now - r.last > 5000) {
        scene.remove(r.av)
        disposeAvatar(r.av)
        remotes.delete(id)
        api.onCountChange?.(remotes.size + 1)
        continue
      }
      const k = 1 - Math.exp(-dt * 12)
      const ox = r.av.position.x
      const oz = r.av.position.z
      r.av.position.x += (r.tx - ox) * k
      r.av.position.z += (r.tz - oz) * k
      const targetY = hall.groundY(r.av.position.x, r.av.position.z) - (r.sit ? 0.3 : 0)
      r.av.position.y += (targetY - r.av.position.y) * k
      r.av.rotation.y += wrapAngle(r.try - r.av.rotation.y) * k
      const sp = Math.hypot(r.av.position.x - ox, r.av.position.z - oz) / Math.max(dt, 0.001)
      animateAvatar(r.av, dt, sp)
    }
  }

  // ---------- الحلقة الرئيسية ----------
  const clock = new THREE.Clock()
  function frame() {
    requestAnimationFrame(frame)
    const dt = Math.min(clock.getDelta(), 0.05)
    sky.update(dt)
    hall.update(dt)
    if (me) {
      // داخل السينما نخفّت الإضاءة العامة بالتدريج
      dim += (hall.darkness(pos.x, pos.z) - dim) * Math.min(1, dt * 3)
      hemi.intensity = 1.7 * (1 - 0.7 * dim)
      sun.intensity = 1.3 * (1 - 0.85 * dim)
    }
    const nowMs = performance.now()
    for (const [id, bb] of bubbles) if (nowMs > bb.until) removeBubble(id)
    for (const fn of api.updaters) fn(dt)
    if (me) {
      updateLocal(dt)
      updateRemotes(dt)
    } else {
      // قبل الدخول: الكاميرا تدور حول المتحف من برا كخلفية
      const t = clock.elapsedTime * 0.1
      camera.position.set(Math.cos(t) * 58, 12, Math.sin(t) * 42)
      camera.lookAt(0, 3, 0)
    }
    renderer.render(scene, camera)
  }
  frame()

  return api
}
