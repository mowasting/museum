import { supabase } from './supabase.js'
import { createWorld } from './world.js'
import { createNetwork } from './network.js'
import { initFrames } from './frames.js'
import { createCreator } from './creator.js'
import { initChat } from './chat.js'
import { normalizeLook, randomLook } from './look.js'

const $ = (id) => document.getElementById(id)

// إيميل صاحب المتحف (من ملف .env): هو الوحيد اللي يعرض فيديوات على شاشة السينما
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase()

let look = randomLook()
let loginCreator = null

const world = createWorld($('scene'), $('joystick'), $('stick'))

function msg(text, ok = false) {
  const m = $('msg')
  m.textContent = text
  m.className = 'msg' + (ok ? ' ok' : '')
}

// ---------- ذاكرة الضيف ----------
function loadGuest() {
  try {
    return JSON.parse(localStorage.getItem('museum_guest'))
  } catch {
    return null
  }
}
function saveGuest(g) {
  try {
    localStorage.setItem('museum_guest', JSON.stringify(g))
  } catch {}
}

const saved = loadGuest()
if (saved) {
  $('name').value = saved.name || ''
  look = normalizeLook(saved.look || { top: saved.color }) // saved.color = نسخة قديمة
}

// ---------- تصميم الشخصية بشاشة الدخول ----------
loginCreator = createCreator($('creator'), look, (l) => {
  look = l
})

// ---------- التبويبات ----------
function setMode(m) {
  $('tab-guest').classList.toggle('active', m === 'guest')
  $('tab-account').classList.toggle('active', m === 'account')
  $('account-fields').hidden = m !== 'account'
  $('btn-guest').hidden = m !== 'guest'
  $('btn-login').hidden = m !== 'account'
  $('btn-signup').hidden = m !== 'account'
  msg('')
  if (m === 'account' && !supabase) msg('Supabase is not connected. Use guest mode.')
}
$('tab-guest').onclick = () => setMode('guest')
$('tab-account').onclick = () => setMode('account')

// ---------- تعديل الشخصية داخل المتحف ----------
function setupCustomize(me) {
  let editor = null
  const modal = $('custom-modal')

  function close() {
    editor?.destroy()
    editor = null
    $('creator2').innerHTML = ''
    modal.hidden = true
  }

  $('btn-customize').onclick = () => {
    $('cm-msg').textContent = ''
    modal.hidden = false
    editor = createCreator($('creator2'), me.look, () => {})
  }
  $('cm-cancel').onclick = close
  $('cm-save').onclick = async () => {
    if (!editor) return
    const newLook = editor.getLook()
    world.updateLook(newLook)
    if (me.isGuest) {
      saveGuest({ id: me.id, name: me.name, look: newLook })
    } else if (supabase) {
      const { error } = await supabase.auth.updateUser({ data: { look: newLook } })
      if (error) {
        $('cm-msg').textContent = error.message
        return
      }
    }
    close()
  }
}

// ---------- الدخول للمتحف ----------
function enter(me) {
  loginCreator?.destroy()
  loginCreator = null
  $('login').hidden = true
  $('hud').hidden = false
  const touch = matchMedia('(pointer: coarse)').matches
  $('joystick').hidden = !touch
  $('hint').hidden = false
  if (touch) $('hint').textContent = 'Joystick to walk · drag the screen to rotate the camera'

  let online = false
  let count = 1
  const setStatus = () => {
    $('status').textContent = !supabase
      ? 'Solo mode (Supabase not connected)'
      : online
        ? `🟢 Online · ${count}`
        : '🟡 Connecting...'
  }

  let chat = null // يتعبّى بعد ما ينبني الشبكة
  const net = createNetwork(
    supabase,
    world.onRemote,
    (status) => {
      online = status === 'SUBSCRIBED'
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') $('status').textContent = '🔴 Disconnected'
      else setStatus()
    },
    (m) => chat?.receive(m)
  )
  world.onCountChange = (n) => {
    count = n
    setStatus()
  }

  // زر فتح الباب
  world.onDoorNear = (near) => {
    $('btn-door').hidden = !near
  }
  $('btn-door').onclick = () => world.openDoor()

  // زر الجلوس على مقاعد السينما
  let sitNear = false
  let isSit = false
  const refreshSit = () => {
    const b = $('btn-sit')
    b.hidden = !(sitNear || isSit)
    b.textContent = isSit ? '🧍 Stand up' : '🪑 Sit'
  }
  world.onSeatNear = (near) => {
    sitNear = near
    refreshSit()
  }
  world.onSitChange = (s) => {
    isSit = s
    refreshSit()
  }
  $('btn-sit').onclick = () => world.toggleSit()

  setStatus()
  world.start(me, net)
  initFrames({ supabase, world, me })
  chat = initChat({ net, world, me })
  setupCustomize(me)
}

function enterFromUser(user) {
  const meta = user.user_metadata || {}
  enter({
    id: user.id,
    name: meta.name || (user.email || 'Visitor').split('@')[0],
    look: normalizeLook(meta.look || { top: meta.color }), // meta.color = نسخة قديمة
    isGuest: false,
    isAdmin: !!ADMIN_EMAIL && (user.email || '').toLowerCase() === ADMIN_EMAIL, // صاحب المتحف فقط
  })
}

// ---------- ضيف ----------
$('btn-guest').onclick = () => {
  const name = $('name').value.trim()
  if (!name) return msg('Enter your name first')
  const g = loadGuest() || {}
  const guest = { id: g.id || crypto.randomUUID(), name, look }
  saveGuest(guest)
  enter({ ...guest, isGuest: true })
}

// ---------- حساب ----------
function translate(m) {
  if (/Invalid login credentials/i.test(m)) return 'Wrong email or password'
  if (/Email not confirmed/i.test(m)) return 'Please confirm your email first (check your inbox)'
  if (/already registered/i.test(m)) return 'This email is already registered, log in instead'
  if (/at least 6/i.test(m)) return 'Password must be at least 6 characters'
  return m
}

$('btn-login').onclick = async () => {
  if (!supabase) return msg('Supabase is not connected')
  const email = $('email').value.trim()
  const password = $('password').value
  if (!email || !password) return msg('Enter email and password')
  msg('Logging in...', true)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return msg(translate(error.message))
  enterFromUser(data.user)
}

$('btn-signup').onclick = async () => {
  if (!supabase) return msg('Supabase is not connected')
  const name = $('name').value.trim()
  const email = $('email').value.trim()
  const password = $('password').value
  if (!name) return msg('Enter your name first')
  if (!email || !password) return msg('Enter email and password')
  msg('Creating account...', true)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, look } },
  })
  if (error) return msg(translate(error.message))
  if (data.session) return enterFromUser(data.user)
  msg('Account created. Check your email to confirm, then log in.', true)
}

// ---------- خروج ----------
$('btn-logout').onclick = async () => {
  try {
    if (supabase) await supabase.auth.signOut()
  } catch {}
  location.reload()
}

// ---------- إذا كان مسجل دخول من قبل ----------
if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) enterFromUser(data.session.user)
  })
}
