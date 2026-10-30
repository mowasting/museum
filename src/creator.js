import * as THREE from 'three'
import { OPTIONS, normalizeLook } from './look.js'
import { createAvatar, disposeAvatar } from './avatar.js'

const LABELS = {
  gender: { m: 'Male', f: 'Female' },
  hairStyle: {
    short: 'Short', sidepart: 'Side part', spiky: 'Spiky', curly: 'Curly', long: 'Long', ponytail: 'Ponytail',
    bun: 'Bun', bald: 'Bald', open: 'Open hair', braid: 'Braid', bob: 'Bob',
  },
  beard: { none: 'None', stubble: 'Stubble', mustache: 'Mustache', goatee: 'Goatee', short: 'Short beard', full: 'Full beard' },
  outfit: { pants: 'Pants', skirt: 'Long skirt', miniskirt: 'Mini skirt + fishnet', abaya: 'Abaya', thobe: 'Thobe' },
  hat: { none: 'None', cap: 'Cap', beanie: 'Beanie' },
}

// واجهة تصميم الشخصية: معاينة 3D + خيارات
// container = العنصر اللي تنبني فيه، onChange(look) تنادى عند كل تغيير
export function createCreator(container, initialLook, onChange) {
  let look = normalizeLook(initialLook)
  container.innerHTML = ''

  // ---------- المعاينة ----------
  const W = 220
  const H = 250
  const canvas = document.createElement('canvas')
  canvas.className = 'cr-preview'
  container.appendChild(canvas)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(W, H, false)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 50)
  // وضعين للكاميرا: الجسم كامل / قريب من الوجه (زر Face close-up)
  const CAM_FULL = { pos: new THREE.Vector3(0, 1.35, 6.2), look: new THREE.Vector3(0, 1.2, 0) }
  const CAM_FACE = { pos: new THREE.Vector3(0, 1.9, 1.9), look: new THREE.Vector3(0, 1.85, 0) }
  let camTarget = CAM_FULL
  const camLook = CAM_FULL.look.clone()
  camera.position.copy(CAM_FULL.pos)
  camera.lookAt(camLook)
  const zoomBtn = document.createElement('button')
  zoomBtn.type = 'button'
  zoomBtn.className = 'chip'
  zoomBtn.textContent = 'Face close-up'
  zoomBtn.onclick = () => {
    const face = camTarget === CAM_FULL
    camTarget = face ? CAM_FACE : CAM_FULL
    zoomBtn.textContent = face ? 'Full body' : 'Face close-up'
  }
  container.appendChild(zoomBtn)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc9bd, 2))
  const sun = new THREE.DirectionalLight(0xffffff, 1.4)
  sun.position.set(3, 6, 5)
  scene.add(sun)

  let avatar = null
  let spin = 0.4
  function rebuildAvatar() {
    if (avatar) {
      scene.remove(avatar)
      disposeAvatar(avatar)
    }
    avatar = createAvatar({ name: '', look })
    avatar.rotation.y = spin
    scene.add(avatar)
  }

  // سحب المعاينة بالماوس/اللمس لتدويرها
  let dragX = null
  canvas.addEventListener('pointerdown', (e) => {
    dragX = e.clientX
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (dragX === null) return
    spin += (e.clientX - dragX) * 0.012
    dragX = e.clientX
  })
  const stopDrag = () => (dragX = null)
  canvas.addEventListener('pointerup', stopDrag)
  canvas.addEventListener('pointercancel', stopDrag)

  let raf = 0
  let last = performance.now()
  function loop(now) {
    raf = requestAnimationFrame(loop)
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    if (!canvas.isConnected || canvas.offsetParent === null) return // مخفي: لا ترسم
    if (dragX === null) spin += dt * 0.6
    if (avatar) avatar.rotation.y = spin
    // حركة ناعمة للكاميرا بين الوضعين
    const ck = Math.min(1, dt * 6)
    camera.position.lerp(camTarget.pos, ck)
    camLook.lerp(camTarget.look, ck)
    camera.lookAt(camLook)
    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(loop)

  // ---------- الخيارات ----------
  const panel = document.createElement('div')
  panel.className = 'cr-panel'
  container.appendChild(panel)

  function set(key, value) {
    const next = { ...look, [key]: value }
    // تعديلات تلقائية عند تغيير الجنس
    if (key === 'gender') {
      // الانثى ما عندها short/bald/sidepart/spiky، والذكر ما عنده open/braid/bob
      if (value === 'f' && !OPTIONS.hairStyleF.includes(look.hairStyle)) next.hairStyle = 'open'
      if (value === 'm' && !OPTIONS.hairStyle.includes(look.hairStyle)) next.hairStyle = 'short'
      if (value === 'm' && (look.hairStyle === 'long' || look.hairStyle === 'ponytail' || look.hairStyle === 'bun'))
        next.hairStyle = 'short'
      // ملابس كل جنس: الانثى (pants/skirt/miniskirt/abaya) والذكر (pants/thobe)
      if (value === 'm' && ['skirt', 'miniskirt', 'abaya'].includes(look.outfit)) next.outfit = 'pants'
      if (value === 'f' && look.outfit === 'thobe') next.outfit = 'pants'
    }
    // العباءة تبدأ سودة والثوب يبدأ ابيض (بعدها تغير اللون من Top color)
    if (key === 'outfit') {
      if (value === 'abaya') next.top = '#222222'
      if (value === 'thobe') next.top = '#f5f5f5'
    }
    look = normalizeLook(next)
    render()
    onChange?.(look)
  }

  function row(title, node) {
    const wrap = document.createElement('div')
    wrap.className = 'cr-row'
    const t = document.createElement('div')
    t.className = 'label'
    t.textContent = title
    wrap.append(t, node)
    panel.appendChild(wrap)
  }
  function chips(key, values, labels) {
    const box = document.createElement('div')
    box.className = 'chips'
    for (const v of values) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip' + (look[key] === v ? ' sel' : '')
      b.textContent = labels[v]
      b.onclick = () => set(key, v)
      box.appendChild(b)
    }
    return box
  }
  function swatches(key) {
    const box = document.createElement('div')
    box.className = 'colors'
    for (const c of OPTIONS[key]) {
      const sw = document.createElement('div')
      sw.className = 'sw' + (look[key].toLowerCase() === c.toLowerCase() ? ' sel' : '')
      sw.style.background = c
      sw.onclick = () => set(key, c)
      box.appendChild(sw)
    }
    return box
  }

  function render() {
    panel.innerHTML = ''
    row('Gender', chips('gender', OPTIONS.gender, LABELS.gender))
    row('Skin tone', swatches('skin'))
    // مع الحجاب الشعر ما يبين، فنخفي خيارات الشعر
    if (!look.hijab) row('Hair style', chips('hairStyle', look.gender === 'f' ? OPTIONS.hairStyleF : OPTIONS.hairStyle, LABELS.hairStyle))
    // لون الشعر يتحكم بلون اللحية بعد
    if (!look.hijab && (look.hairStyle !== 'bald' || look.beard !== 'none')) row('Hair color', swatches('hairColor'))
    if (look.gender === 'm') row('Beard', chips('beard', OPTIONS.beard, LABELS.beard))
    row('Eye color', swatches('eyeColor'))
    row('Outfit', chips('outfit', look.gender === 'f' ? OPTIONS.outfitF : OPTIONS.outfitM, LABELS.outfit))
    const robe = look.outfit === 'abaya' || look.outfit === 'thobe'
    row(look.outfit === 'abaya' ? 'Abaya color' : look.outfit === 'thobe' ? 'Thobe color' : 'Top color', swatches('top'))
    // التنورة القصيرة سودة دائماً والعباءة/الثوب قطعة وحدة، فما نعرض لون الأسفل لهم
    if (look.outfit !== 'miniskirt' && !robe) row(look.outfit === 'skirt' ? 'Skirt color' : 'Pants color', swatches('bottom'))
    row('Shoes', swatches('shoes'))

    // الحجاب: يطلع فقط مع العباءة (مشغّل افتراضياً)
    if (look.outfit === 'abaya') {
      const hj = document.createElement('div')
      hj.className = 'chips'
      const hb = document.createElement('button')
      hb.type = 'button'
      hb.className = 'chip' + (look.hijab ? ' sel' : '')
      hb.textContent = look.hijab ? 'Hijab: on' : 'Hijab: off'
      hb.onclick = () => set('hijab', !look.hijab)
      hj.appendChild(hb)
      row('Hijab', hj)
    }

    const glasses = document.createElement('div')
    glasses.className = 'chips'
    const gb = document.createElement('button')
    gb.type = 'button'
    gb.className = 'chip' + (look.glasses ? ' sel' : '')
    gb.textContent = look.glasses ? 'Glasses: on' : 'Glasses: off'
    gb.onclick = () => set('glasses', !look.glasses)
    glasses.appendChild(gb)
    row('Accessories', glasses)
    if (!look.hijab) {
      row('Hat', chips('hat', OPTIONS.hat, LABELS.hat))
      if (look.hat !== 'none') row('Hat color', swatches('hatColor'))
    }
    rebuildAvatar()
  }
  render()

  return {
    getLook: () => look,
    destroy() {
      cancelAnimationFrame(raf)
      if (avatar) disposeAvatar(avatar)
      renderer.dispose()
      container.innerHTML = ''
    },
  }
}