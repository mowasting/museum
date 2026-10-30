import * as THREE from 'three'
import { PIC_W, PIC_H } from './hall.js'

const BUCKET = 'museum-media'
const MAX_PHOTO_MB = 15
const MAX_VIDEO_MB = 25
const NEAR_DIST = 4.2 // المسافة اللي يظهر عندها زر الإطار
const CLICK_DIST = 7 // أقصى مسافة للضغط مباشرة على الإطار
const VIDEO_PLAY_DIST = 14 // الفيديو يشتغل فقط إذا كنت قريب منه

export function initFrames({ supabase, world, me }) {
  const $ = (id) => document.getElementById(id)
  const canvas = $('scene')
  const modal = $('frame-modal')
  const btnFrame = $('btn-frame')

  const slots = world.slots
  const placeholder = slots[0].picture.material // مادة الإطار الفارغ المشتركة
  const byId = new Map(slots.map((s) => [s.id, s]))
  const groupToSlot = new Map(slots.map((s) => [s.group, s]))
  const rows = new Map() // slot_id -> الصف الموجود بقاعدة البيانات
  const media = new Map() // slot_id -> { texture, video? }
  const loader = new THREE.TextureLoader()
  const tries = new Map() // url -> عدد مرات فشل التحميل
  let soundOn = false // صوت فيديو السينما
  let lastLocalChange = 0 // آخر تعديل سويته أنا (لتجاهل ردود المزامنة القديمة)

  // ---------- ساعة السيرفر: كل الأجهزة تتفق على الوقت حتى لو ساعاتها مختلفة ----------
  let clockOffset = 0 // = وقت السيرفر - وقت جهازي (بالملي ثانية)
  async function syncClock() {
    try {
      const t0 = Date.now()
      const { data, error } = await supabase.rpc('server_now')
      const t1 = Date.now()
      if (!error && data) clockOffset = new Date(data).getTime() - (t0 + t1) / 2
    } catch {}
  }
  const serverNow = () => Date.now() + clockOffset
  const fmt = (s) => {
    s = Math.max(0, Math.floor(Number(s) || 0))
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
  }

  // ---------- رسالة قصيرة ----------
  let toastTimer
  function toast(text) {
    const t = $('toast')
    t.textContent = text
    t.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (t.hidden = true), 2200)
  }

  // ---------- الاسم المكتوب على لوحة الإطار ----------
  const cleanName = (s) =>
    String(s ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24)

  function setPlate(slot, text) {
    if (!slot || slot.shared) return
    text = cleanName(text)
    if (!text) {
      if (slot.nameMesh) slot.nameMesh.visible = false
      return
    }
    if (!slot.nameMesh) {
      const c = document.createElement('canvas')
      c.width = 630
      c.height = 80
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.26, 0.16),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      )
      mesh.position.set(0, -1.55, 0.056) // فوق لوحة الاسم الذهبية
      slot.group.add(mesh)
      slot.nameMesh = mesh
      slot.nameCanvas = c
      slot.nameTex = tex
    }
    const c = slot.nameCanvas
    const g = c.getContext('2d')
    g.clearRect(0, 0, c.width, c.height)
    g.fillStyle = '#f1d98a'
    g.font = '700 46px Georgia, "Segoe UI", Tahoma, "Noto Naskh Arabic", serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, c.width / 2, c.height / 2 + 3, c.width - 40)
    slot.nameTex.needsUpdate = true
    slot.nameMesh.visible = true
  }

  // ---------- عرض الصورة أو الفيديو على الإطار ----------
  function fit(slot, w, h) {
    const aspect = w / h
    const boxAspect = (slot.picW || PIC_W) / (slot.picH || PIC_H)
    if (aspect > boxAspect) slot.picture.scale.set(1, boxAspect / aspect, 1)
    else slot.picture.scale.set(aspect / boxAspect, 1, 1)
  }

  function clearSlot(id) {
    const slot = byId.get(id)
    if (!slot) return
    const m = media.get(id)
    if (m) {
      if (m.video) {
        m.video.pause()
        m.video.removeAttribute('src')
        m.video.load()
      }
      m.texture.dispose()
      slot.picture.material.dispose()
      media.delete(id)
    }
    slot.picture.material = slot.placeholder || placeholder
    slot.picture.scale.set(1, 1, 1)
    setPlate(slot, '') // الإطار فاضي: نخفي الاسم
  }

  function applyRow(row) {
    const prev = rows.get(row.slot_id)
    rows.set(row.slot_id, row)
    if (prev && prev.url === row.url) {
      // نفس المحتوى، ما نعيد التحميل: بس نحدّث الاسم إذا تغيّر
      setPlate(byId.get(row.slot_id), row.title || row.owner_name)
      return
    }
    const slot = byId.get(row.slot_id)
    if (!slot) return
    clearSlot(row.slot_id)
    setPlate(slot, row.title || row.owner_name) // الاسم المكتوب (أو اسم صاحب الرفع إذا ما انكتب)

    if (row.kind === 'photo') {
      loader.load(row.url, (tex) => {
        // إذا تغير المحتوى أثناء التحميل نتجاهل هذي النتيجة
        if (rows.get(row.slot_id)?.url !== row.url) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        slot.picture.material = new THREE.MeshBasicMaterial({ map: tex })
        fit(slot, tex.image.width, tex.image.height)
        media.set(row.slot_id, { texture: tex })
      },
      undefined,
      () => {
        const n = (tries.get(row.url) || 0) + 1
        tries.set(row.url, n)
        console.warn('Frame image failed to load:', row.url)
        // نحذف السجل المحلي ليعيد المزامنة القادمة المحاولة (حد أقصى 3)
        if (n < 3 && rows.get(row.slot_id)?.url === row.url) rows.delete(row.slot_id)
      })
    } else {
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.muted = slot.shared ? !soundOn : true // فيديو السينما يتبع زر الصوت
      video.loop = true
      video.playsInline = true
      video.preload = 'auto'
      video.src = row.url
      const tex = new THREE.VideoTexture(video)
      tex.colorSpace = THREE.SRGBColorSpace
      video.addEventListener('loadedmetadata', () => fit(slot, video.videoWidth, video.videoHeight))
      video.addEventListener('error', () => {
        console.warn('Frame video cannot be played on this device:', row.url)
        toast("This video format isn't supported on this device")
      })
      // نعرض أول لقطة حتى قبل ما يشتغل الفيديو
      video.addEventListener('loadeddata', () => {
        if (video.paused) video.currentTime = 0.1
      })
      slot.picture.material = new THREE.MeshBasicMaterial({ map: tex })
      media.set(row.slot_id, { texture: tex, video })
    }
  }

  // ---------- تحميل الموجود + التحديث الفوري للكل ----------
  async function syncAll() {
    const startedAt = Date.now()
    const { data, error } = await supabase.from('frames').select('*')
    if (error) return console.warn('Could not load frames:', error.message)
    if (lastLocalChange > startedAt) return // رد قديم: صار عندي تعديل أحدث
    const seen = new Set()
    for (const row of data || []) {
      seen.add(row.slot_id)
      applyRow(row)
    }
    // إطار انحذف عند غيري ولم يصلني الإشعار
    for (const id of [...rows.keys()]) {
      if (!seen.has(id)) {
        rows.delete(id)
        clearSlot(id)
      }
    }
  }

  if (supabase) {
    syncClock()
    setInterval(syncClock, 60000)
    syncAll()

    supabase
      .channel('frames-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'frames' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old?.slot_id
          if (id) {
            rows.delete(id)
            clearSlot(id)
          }
        } else if (payload.new) {
          applyRow(payload.new)
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') syncAll()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Frames realtime:', status)
      })

    // شبكة أمان: إذا ما اشتغل الإشعار الفوري، المزامنة الدورية تجلب الصور خلال ثواني
    setInterval(syncAll, 4000)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncAll()
    })
  }

  // ---------- السينما: وقت مشترك للكل، والتحكم لصاحب المتحف فقط ----------
  // حالة الفيديو محفوظة بسطر السينما بجدول frames:
  //   playing = شغال أو موقوف | pos = مكان الفيديو بالثواني | pos_at = وقت تسجيل هذا المكان (بساعة السيرفر)
  // كل جهاز يحسب المكان الحالي من هاي الثلاث، فالكل يشوف نفس اللقطة بنفس الوقت
  const cinemaPlaying = (row) => !row || row.playing !== false

  function wantPos(row, dur) {
    const base = Math.max(0, Number(row.pos) || 0)
    if (!cinemaPlaying(row)) return Math.min(base, dur)
    const at = Date.parse(row.pos_at || row.updated_at)
    const elapsed = isFinite(at) ? Math.max(0, (serverNow() - at) / 1000) : 0
    return (((base + elapsed) % dur) + dur) % dur // الفيديو يعيد نفسه (loop)
  }

  let lastCmd = null // آخر أمر طبقناه (لنقفز فوراً لما المالك يقدّم/يأخّر)
  let lastSeekAt = 0
  function cinemaStep(video, row) {
    if (!row) return
    const dur = video.duration
    if (!isFinite(dur) || dur <= 0 || video.readyState < 1) return
    const want = wantPos(row, dur)
    const cmd = row.pos_at || row.updated_at || ''
    const isNewCmd = cmd !== lastCmd
    lastCmd = cmd
    let diff = Math.abs(video.currentTime - want)
    diff = Math.min(diff, dur - diff) // الفرق عبر نقطة الإعادة
    if (!cinemaPlaying(row)) {
      // المالك موقف الفيديو: نوقفه عند نفس اللقطة
      if (diff > 0.25) video.currentTime = want
      if (!video.paused) video.pause()
      return
    }
    if (diff > 1.5 && (isNewCmd || Date.now() - lastSeekAt > 2500)) {
      video.currentTime = want
      lastSeekAt = Date.now()
    }
    if (video.paused) video.play().catch(() => {})
  }

  // ---------- أوامر المالك (تشغيل/إيقاف/تقديم/تأخير) ----------
  const cinemaDur = () => {
    const v = media.get('cinema')?.video
    return v && isFinite(v.duration) ? v.duration : 0
  }
  function curPos() {
    const row = rows.get('cinema')
    const dur = cinemaDur()
    return row && dur ? wantPos(row, dur) : 0
  }
  async function cinemaCommand(patch) {
    const row = rows.get('cinema')
    if (!row || !me.isAdmin || !supabase) return
    const next = { ...row, ...patch, pos_at: new Date(serverNow()).toISOString() }
    rows.set('cinema', next) // يتنفذ عندي فوراً
    lastLocalChange = Date.now()
    const { error } = await supabase
      .from('frames')
      .update({ playing: next.playing, pos: next.pos, pos_at: next.pos_at })
      .eq('slot_id', 'cinema')
    lastLocalChange = Date.now()
    if (error) toast(error.message)
  }
  const cmdPlayPause = () => cinemaCommand({ playing: !cinemaPlaying(rows.get('cinema')), pos: curPos() })
  const cmdSkip = (d) => {
    const dur = cinemaDur()
    if (dur) cinemaCommand({ pos: Math.min(Math.max(0, curPos() + d), Math.max(0, dur - 0.5)) })
  }
  const cmdSeek = (s) => cinemaCommand({ pos: Math.max(0, Number(s) || 0) })

  // شريط التحكم: يظهر لصاحب المتحف فقط
  let ctl = null
  let ctlPlay = null
  let ctlSlider = null
  let ctlTime = null
  let ctlDragging = false
  if (me.isAdmin) {
    ctl = document.createElement('div')
    ctl.style.cssText =
      'position:fixed;left:50%;top:70px;transform:translateX(-50%);display:none;align-items:center;gap:6px;padding:8px 12px;background:rgba(0,0,0,.65);border:1px solid rgba(241,217,138,.5);border-radius:14px;z-index:30;color:#fff;font:13px sans-serif;backdrop-filter:blur(6px)'
    const mk = (txt, fn) => {
      const b = document.createElement('button')
      b.textContent = txt
      b.style.cssText = 'background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:2px 6px'
      b.onclick = fn
      return b
    }
    ctlPlay = mk('⏸', cmdPlayPause)
    ctlSlider = document.createElement('input')
    ctlSlider.type = 'range'
    ctlSlider.min = 0
    ctlSlider.step = 0.5
    ctlSlider.value = 0
    ctlSlider.style.width = '130px'
    ctlTime = document.createElement('span')
    ctlSlider.oninput = () => {
      ctlDragging = true
      ctlTime.textContent = `${fmt(ctlSlider.value)} / ${fmt(cinemaDur())}`
    }
    ctlSlider.onchange = () => {
      ctlDragging = false
      cmdSeek(parseFloat(ctlSlider.value))
    }
    ctl.append(mk('⏪', () => cmdSkip(-10)), ctlPlay, mk('⏩', () => cmdSkip(10)), ctlSlider, ctlTime)
    document.body.appendChild(ctl)
  }

  // ---------- زر الصوت (لكل شخص لحاله) ----------
  const btnSound = document.createElement('button')
  btnSound.id = 'btn-sound'
  btnSound.className = 'door-btn'
  btnSound.hidden = true
  const soundLabel = () => (btnSound.textContent = soundOn ? '🔊 Sound on' : '🔇 Sound off')
  soundLabel()
  btnSound.onclick = () => {
    soundOn = !soundOn
    soundLabel()
    const v = media.get('cinema')?.video
    if (v) {
      v.muted = !soundOn
      if (cinemaPlaying(rows.get('cinema'))) v.play().catch(() => {})
    }
  }
  document.body.appendChild(btnSound)

  // ---------- أقرب إطار (يظهر الزر) ----------
  let nearSlot = null
  function updateNear(p) {
    let best = null
    let bestD = Infinity
    for (const s of slots) {
      const dx = p.x - s.position.x
      const dz = p.z - s.position.z
      const d = Math.hypot(dx, dz)
      if (s.shared && !me.isAdmin) continue // شاشة السينما: لصاحب المتحف فقط
      if (d > (s.nearDist || NEAR_DIST) || d >= bestD) continue
      // لازم يكون اللاعب أمام الإطار مو خلف الحايط
      if ((dx * s.normal.x + dz * s.normal.z) / (d || 1) < 0.5) continue
      best = s
      bestD = d
    }
    if (best !== nearSlot) {
      nearSlot = best
      if (best)
        btnFrame.textContent = best.shared
          ? rows.has(best.id)
            ? '🎬 Screen options'
            : '🎬 Play a video'
          : rows.has(best.id)
            ? '🖼️ Frame options'
            : '➕ Add photo or video'
    }
    btnFrame.hidden = !nearSlot || !modal.hidden
  }

  // ---------- تشغيل الفيديو القريب فقط ----------
  let acc = 0
  world.updaters.push((dt) => {
    const p = world.getPos()
    updateNear(p)
    const cin = byId.get('cinema')
    const cinNear = !!(cin && cin.playIf(p) && media.get('cinema')?.video)
    btnSound.hidden = !cinNear || !modal.hidden
    if (ctl) ctl.style.display = cinNear && modal.hidden ? 'flex' : 'none'
    acc += dt
    if (acc < 0.3) return
    acc = 0
    for (const [id, m] of media) {
      if (!m.video) continue
      const s = byId.get(id)
      const d = Math.hypot(p.x - s.position.x, p.z - s.position.z)
      const shouldPlay = s.playIf ? s.playIf(p) : d < VIDEO_PLAY_DIST
      if (shouldPlay) {
        if (s.shared) cinemaStep(m.video, rows.get(id)) // السينما: تشغيل/إيقاف/مكان حسب حالة المالك
        else if (m.video.paused) m.video.play().catch(() => {})
      } else if (!m.video.paused) {
        m.video.pause()
      }
    }
    // تحديث شريط التحكم عند المالك
    if (ctl && cinNear) {
      const v = media.get('cinema').video
      ctlPlay.textContent = cinemaPlaying(rows.get('cinema')) ? '⏸' : '▶️'
      if (!ctlDragging && isFinite(v.duration)) {
        ctlSlider.max = v.duration
        ctlSlider.value = v.currentTime
        ctlTime.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`
      }
    }
  })

  // ---------- الضغط المباشر على الإطار ----------
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let down = null
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() }
  })
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    const dur = performance.now() - down.t
    down = null
    // ضغطة سريعة بدون سحب (السحب لتدوير الكاميرا)
    if (moved > 6 || dur > 500 || !modal.hidden) return
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, world.camera)
    const hits = ray.intersectObjects(
      slots.map((s) => s.group),
      true
    )
    if (!hits.length) return
    let obj = hits[0].object
    while (obj && !groupToSlot.has(obj)) obj = obj.parent
    const slot = groupToSlot.get(obj)
    if (!slot) return
    if (slot.shared && !me.isAdmin) return toast('Only the museum owner can play videos on the cinema screen')
    const p = world.getPos()
    const dx = p.x - slot.position.x
    const dz = p.z - slot.position.z
    const d = Math.hypot(dx, dz)
    if ((dx * slot.normal.x + dz * slot.normal.z) / (d || 1) < 0.2) return
    if (d > (slot.clickDist || CLICK_DIST)) return toast('Walk closer to the frame')
    openModal(slot)
  })
  btnFrame.onclick = () => nearSlot && openModal(nearSlot)

  // ---------- نافذة الإطار ----------
  let current = null
  let pendingKind = 'photo'

  function setMsg(text, ok = false) {
    const m = $('fm-msg')
    m.textContent = text
    m.className = 'msg' + (ok ? ' ok' : '')
  }
  function setBusy(b) {
    for (const id of ['fm-photo', 'fm-video', 'fm-remove', 'fm-close', 'fm-name-save']) $(id).disabled = b
  }

  function openModal(slot) {
    current = slot
    const row = rows.get(slot.id)
    // السينما: صاحب المتحف فقط. باقي الإطارات: الفاضي أو إطارك أنت
    const mine = slot.shared ? !!me.isAdmin : !row || row.owner_id === me.id
    const n = Number(slot.id.replace('slot-', '')) + 1
    $('fm-title').textContent = slot.shared ? '🎬 Cinema screen' : `Frame ${n} · Hall ${slot.corridor}`
    setMsg('')
    if (!supabase) {
      $('fm-info').textContent = 'Online mode is required to add photos and videos.'
      $('fm-photo').hidden = $('fm-video').hidden = $('fm-remove').hidden = true
      $('fm-name-wrap').hidden = true
    } else {
      $('fm-info').textContent = !row
        ? 'This frame is empty.'
        : mine
          ? 'This is your frame. You can replace or remove it.'
          : `Added by ${row.owner_name || 'a visitor'}.`
      if (slot.shared)
        $('fm-info').textContent = row
          ? 'A video is playing. You can replace or remove it.'
          : 'The screen is empty. Add a video for everyone in the cinema.'
      $('fm-photo').hidden = !mine || !!slot.shared // السينما: فيديو فقط
      $('fm-video').hidden = !mine
      $('fm-remove').hidden = !(row && mine)
      $('fm-name-wrap').hidden = !mine || !!slot.shared
      $('fm-name-save').hidden = !(row && mine) || !!slot.shared
      $('fm-name').value = row ? row.title || row.owner_name || me.name : me.name
    }
    modal.hidden = false
    btnFrame.hidden = true
  }
  function closeModal() {
    modal.hidden = true
    current = null
    nearSlot = null // يعيد حساب الزر
  }
  $('fm-close').onclick = closeModal
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !modal.hidden) closeModal()
  })

  $('fm-photo').onclick = () => pick('photo')
  $('fm-video').onclick = () => pick('video')
  function pick(kind) {
    pendingKind = kind
    const input = $('fm-file')
    input.accept = kind === 'photo' ? 'image/*' : 'video/*'
    input.value = ''
    input.click()
  }
  $('fm-file').onchange = (e) => upload(pendingKind, e.target.files[0])

  // ---------- الرفع ----------
  // فيديوهات الجوال غالباً HEVC (H.265): يشتغل بالجوال ويطلع أسود على كثير من الكمبيوترات
  async function isHevc(file) {
    const b = new Uint8Array(await file.arrayBuffer())
    for (let i = 0; i < b.length - 4; i++) {
      const a = b[i]
      if (a !== 0x68 && a !== 0x64) continue // 'h' أو 'd'
      const s = String.fromCharCode(a, b[i + 1], b[i + 2], b[i + 3])
      if (s === 'hvc1' || s === 'hev1' || s === 'dvh1' || s === 'dvhe') return true
    }
    return false
  }

  async function compressImage(file) {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close?.()
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85))
    if (!blob) throw new Error('Could not process the image')
    return blob
  }

  function removeFile(url) {
    const marker = `/object/public/${BUCKET}/`
    const i = url.indexOf(marker)
    if (i < 0) return
    supabase.storage
      .from(BUCKET)
      .remove([decodeURIComponent(url.slice(i + marker.length))])
      .catch(() => {})
  }

  async function upload(kind, file) {
    if (!file || !current || !supabase) return
    const slot = current
    const old = rows.get(slot.id)
    if (slot.shared && !me.isAdmin) return setMsg('Only the museum owner can play videos here')
    if (slot.shared && kind !== 'video') return setMsg('The cinema screen only plays videos')
    if (old && old.owner_id !== me.id && !slot.shared) return setMsg('This frame belongs to someone else')
    const limit = kind === 'photo' ? MAX_PHOTO_MB : MAX_VIDEO_MB
    if (file.size > limit * 1024 * 1024) return setMsg(`File is too big (max ${limit} MB)`)
    if (!file.type.startsWith(kind === 'photo' ? 'image/' : 'video/')) return setMsg('Wrong file type')

    setBusy(true)
    if (kind === 'video') {
      setMsg('Checking video format...', true)
      if (await isHevc(file).catch(() => false)) {
        setBusy(false)
        return setMsg('This video uses HEVC (H.265) and will look black on most computers. Re-record or convert it to H.264 (MP4) first.')
      }
    }
    setMsg('Uploading...', true)
    try {
      let body = file
      let ext
      let type
      if (kind === 'photo') {
        body = await compressImage(file)
        ext = 'jpg'
        type = 'image/jpeg'
      } else {
        ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4'
        type = file.type || 'video/mp4'
      }
      const path = `${slot.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, body, { contentType: type, cacheControl: '31536000' })
      if (upErr) throw upErr
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

      const row = {
        slot_id: slot.id,
        kind,
        url,
        owner_id: me.id,
        owner_name: me.name,
        title: slot.shared ? null : cleanName($('fm-name').value) || me.name, // الاسم المكتوب على الإطار
        updated_at: new Date().toISOString(),
        // فيديو السينما جديد: يبدأ من الصفر وشغال، والكل يتبع نفس الوقت
        ...(slot.shared ? { playing: true, pos: 0, pos_at: new Date(serverNow()).toISOString() } : {}),
      }
      const { error: dbErr } = await supabase.from('frames').upsert(row)
      if (dbErr) throw dbErr
      lastLocalChange = Date.now()

      applyRow(row) // يظهر عندك فوراً، والباقي يوصلهم بالتحديث الفوري
      if (old) removeFile(old.url)
      closeModal()
    } catch (err) {
      setMsg(err.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  // حفظ الاسم فقط (بدون تغيير الصورة)
  $('fm-name-save').onclick = async () => {
    if (!current || !supabase) return
    const slot = current
    const old = rows.get(slot.id)
    if (!old || slot.shared || old.owner_id !== me.id) return
    const title = cleanName($('fm-name').value)
    setBusy(true)
    setMsg('Saving...', true)
    try {
      const { error } = await supabase.from('frames').update({ title }).eq('slot_id', slot.id)
      if (error) throw error
      lastLocalChange = Date.now()
      applyRow({ ...old, title })
      setMsg('Saved ✓', true)
    } catch (err) {
      setMsg(err.message || 'Could not save the name')
    } finally {
      setBusy(false)
    }
  }

  $('fm-remove').onclick = async () => {
    if (!current || !supabase) return
    const slot = current
    const old = rows.get(slot.id)
    if (!old || (slot.shared ? !me.isAdmin : old.owner_id !== me.id)) return
    setBusy(true)
    setMsg('Removing...', true)
    try {
      const { error } = await supabase.from('frames').delete().eq('slot_id', slot.id)
      if (error) throw error
      lastLocalChange = Date.now()
      removeFile(old.url)
      rows.delete(slot.id)
      clearSlot(slot.id)
      closeModal()
    } catch (err) {
      setMsg(err.message || 'Could not remove')
    } finally {
      setBusy(false)
    }
  }
}