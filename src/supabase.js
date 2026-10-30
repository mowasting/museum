import { createClient } from '@supabase/supabase-js'

// القيم تنقرأ من ملف .env
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// إذا الملف ناقص، supabase = null والموقع يشتغل بوضع فردي (بدون أونلاين)
export const supabase =
  url && key
    ? createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } })
    : null