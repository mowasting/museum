// دردشة بأسلوب ماين كرافت: شريط جانبي يشوفه الجميع + فقاعة فوق راس المرسل
const MAX_LEN = 120 // أقصى طول للرسالة
const KEEP = 60 // عدد الأسطر المحفوظة بالشريط
const SHOW_MS = 9000 // مدة بقاء السطر ظاهر والدردشة مسكّرة
const SEND_GAP = 700 // أقل فرق بين رسالتين تبعتهم (ملّي ثانية)

// ننظف أي نص قادم (من الشبكة أو من الإدخال): بدون رموز تحكم، وبطول محدد
const clean = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEN)

// لون ثابت لكل اسم
function nameColor(name) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 85% 72%)`
}

export function initChat({ net, world, me }) {
  const root = document.createElement('div')
  root.id = 'chat'
  const log = document.createElement('div')
  log.className = 'chat-log'
  const form = document.createElement('form')
  form.className = 'chat-form'
  form.hidden = true
  const input = document.createElement('input')
  input.type = 'text'
  input.maxLength = MAX_LEN
  input.autocomplete = 'off'
  input.placeholder = 'Type a message...'
  input.enterKeyHint = 'send'
  form.appendChild(input)
  root.append(log, form)

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'chat-btn'
  btn.textContent = '💬'
  btn.setAttribute('aria-label', 'Chat')
  document.body.append(root, btn)

  const isOpen = () => root.classList.contains('open')
  const modalOpen = () => ['frame-modal', 'custom-modal'].some((id) => document.getElementById(id)?.hidden === false)

  function open() {
    root.classList.add('open')
    form.hidden = false
    input.focus()
    log.scrollTop = log.scrollHeight
  }
  function close() {
    input.blur()
    input.value = ''
    form.hidden = true
    root.classList.remove('open')
  }
  btn.onclick = () => (isOpen() ? close() : open())

  // T أو Enter يفتح الدردشة، Esc يسكّرها
  window.addEventListener('keydown', (e) => {
    if (document.activeElement === input) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
      return
    }
    const tag = e.target && e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || modalOpen()) return
    if (e.code === 'KeyT' || e.key === 'Enter') {
      e.preventDefault() // حتى ما تنكتب T داخل الخانة
      open()
    }
  })

  function addLine(name, text, system = false) {
    const line = document.createElement('div')
    line.className = 'chat-line' + (system ? ' sys' : '')
    line.dataset.t = String(Date.now())
    if (system) {
      line.textContent = text
    } else {
      const n = document.createElement('span')
      n.className = 'chat-name'
      n.style.color = nameColor(name)
      n.textContent = `<${name}> `
      const t = document.createElement('span')
      t.textContent = text // textContent فقط: لا HTML أبداً
      line.append(n, t)
    }
    log.appendChild(line)
    while (log.children.length > KEEP) log.removeChild(log.firstChild)
    log.scrollTop = log.scrollHeight
  }

  // الأسطر القديمة تختفي لما تكون الدردشة مسكّرة
  setInterval(() => {
    const now = Date.now()
    for (const line of log.children) {
      const age = now - Number(line.dataset.t)
      line.classList.toggle('old', age > SHOW_MS)
      line.classList.toggle('gone', age > SHOW_MS + 1000)
    }
  }, 400)

  let lastSend = 0
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const text = clean(input.value)
    close()
    if (!text) return
    const now = Date.now()
    if (now - lastSend < SEND_GAP) return addLine('', 'Slow down a little', true)
    lastSend = now
    addLine(me.name, text)
    world.showBubble(me.id, text)
    if (net && !net.sendChat({ id: me.id, name: me.name, text })) {
      addLine('', 'Not connected yet: others did not get that message', true)
    }
  })

  const lastFrom = new Map() // حماية بسيطة من الإغراق
  return {
    // رسالة جاية من لاعب ثاني
    receive(p) {
      if (!p || typeof p.text !== 'string' || typeof p.name !== 'string') return
      const id = String(p.id ?? '')
      if (!id || id === me.id) return
      const now = Date.now()
      if (now - (lastFrom.get(id) || 0) < 300) return
      lastFrom.set(id, now)
      const text = clean(p.text)
      if (!text) return
      addLine(clean(p.name).slice(0, 20) || '?', text)
      world.showBubble(id, text)
    },
  }
}
