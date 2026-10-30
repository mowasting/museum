// خيارات شكل الشخصية + تنظيف أي قيم قادمة من الشبكة أو الحساب
const HEX = /^#[0-9a-fA-F]{6}$/

const CLOTH_COLORS = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#6a4c93', '#ff7eb6', '#222222', '#f5f5f5']

export const OPTIONS = {
  gender: ['m', 'f'],
  skin: ['#fde0c8', '#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#5c3a21'],
  // الذكر: short / sidepart / spiky / curly / long / ponytail / bun / bald
  hairStyle: ['short', 'sidepart', 'spiky', 'curly', 'long', 'ponytail', 'bun', 'bald'],
  // الانثى: open (شعر مفتوح) / long / ponytail / bun / braid / bob / curly
  hairStyleF: ['open', 'long', 'ponytail', 'bun', 'braid', 'bob', 'curly'],
  hairColor: ['#1b1b1b', '#3b2417', '#6b4423', '#a9743a', '#d9b36c', '#b5361f', '#8e8e93', '#7b3fb5'],
  eyeColor: ['#3b2417', '#2f6fb2', '#2e8b57', '#7a7a7a', '#8a5a2b'],
  // الملابس: pants/skirt/miniskirt/abaya للانثى، pants/thobe للذكر
  outfit: ['pants', 'skirt', 'miniskirt', 'abaya', 'thobe'],
  outfitF: ['pants', 'skirt', 'miniskirt', 'abaya'],
  outfitM: ['pants', 'thobe'],
  top: CLOTH_COLORS, // لون العباءة والثوب نفسه لون القميص (top)
  bottom: ['#2b2f3a', '#1f3a5f', '#5a4632', '#7a7a7a', '#e9e6df', '#8b2f3c'],
  shoes: ['#f2f2f2', '#222222', '#8b5a2b', '#c0392b'],
  hat: ['none', 'cap', 'beanie'],
  hatColor: CLOTH_COLORS,
  // اللحية (للذكر فقط، ولونها نفس لون الشعر)
  beard: ['none', 'stubble', 'mustache', 'goatee', 'short', 'full'],
}

const DEFAULTS = {
  gender: 'm',
  skin: '#f1c9a5',
  hairStyle: 'short',
  hairColor: '#3b2417',
  eyeColor: '#3b2417',
  outfit: 'pants',
  top: '#2a9d8f',
  bottom: '#2b2f3a',
  shoes: '#f2f2f2',
  glasses: false,
  hat: 'none',
  hatColor: '#e63946',
}

const pick = (v, arr, fallback) => (arr.includes(v) ? v : fallback)
const color = (v, fallback) => (typeof v === 'string' && HEX.test(v) ? v : fallback)

export function normalizeLook(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const gender = pick(r.gender, OPTIONS.gender, 'm')
  const d = { ...DEFAULTS, gender, hairStyle: gender === 'f' ? 'long' : 'short' }
  const outfit = pick(r.outfit, gender === 'f' ? OPTIONS.outfitF : OPTIONS.outfitM, 'pants')
  return {
    gender,
    skin: color(r.skin, d.skin),
    // أي شعر غير مسموح للجنس (مثل short للانثى) يتحول تلقائياً للافتراضي
    hairStyle: pick(r.hairStyle, gender === 'f' ? OPTIONS.hairStyleF : OPTIONS.hairStyle, d.hairStyle),
    hairColor: color(r.hairColor, d.hairColor),
    eyeColor: color(r.eyeColor, d.eyeColor),
    outfit,
    top: color(r.top ?? r.color, d.top), // r.color = القديم (قبل ما نضيف التفاصيل)
    bottom: color(r.bottom, d.bottom),
    shoes: color(r.shoes, d.shoes),
    glasses: !!r.glasses,
    hat: pick(r.hat, OPTIONS.hat, d.hat),
    hatColor: color(r.hatColor, d.hatColor),
    // اللحية للذكر فقط. الحجاب للانثى مع العباءة فقط (يشتغل افتراضياً ويمكن اطفاؤه)
    beard: gender === 'm' ? pick(r.beard, OPTIONS.beard, 'none') : 'none',
    hijab: gender === 'f' && outfit === 'abaya' ? r.hijab !== false : false,
  }
}

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)]

// شكل عشوائي للمستخدم الجديد
export function randomLook() {
  const gender = rnd(OPTIONS.gender)
  const outfit = gender === 'f' ? rnd(OPTIONS.outfitF) : rnd(['pants', 'pants', 'thobe'])
  return normalizeLook({
    gender,
    skin: rnd(OPTIONS.skin),
    hairStyle: gender === 'f' ? rnd(OPTIONS.hairStyleF) : rnd(['short', 'short', 'sidepart', 'spiky', 'curly', 'bald']),
    hairColor: rnd(OPTIONS.hairColor),
    eyeColor: rnd(OPTIONS.eyeColor),
    outfit,
    // العباءة افتراضياً سودة والثوب ابيض
    top: outfit === 'abaya' ? '#222222' : outfit === 'thobe' ? '#f5f5f5' : rnd(OPTIONS.top),
    bottom: rnd(OPTIONS.bottom),
    shoes: rnd(OPTIONS.shoes),
    glasses: Math.random() < 0.25,
    hat: 'none',
    hatColor: rnd(OPTIONS.hatColor),
    beard: gender === 'm' ? rnd(['none', 'none', 'stubble', 'mustache', 'goatee', 'short', 'full']) : 'none',
  })
}
