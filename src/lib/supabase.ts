import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// Vite, VITE_* değişkenlerini derleme sırasında bundle'a inline eder. Değer
// eksikse eskiden sahte bir URL/anahtar ('https://missing-project.supabase.co')
// kullanılıyordu; bu, yapılandırma hatasını gizleyip her ekranda anlamsız ağ
// hatalarına dönüştürüyordu. Bunun yerine erken ve açık bir hata veriyoruz.
function readRequiredEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const value = import.meta.env[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `${name} tanımlı değil. Proje kökündeki .env dosyasını .env.example örneğine göre doldurun ve uygulamayı yeniden derleyin (npm run build).`,
    )
  }
  return value.trim()
}

const supabaseUrl = readRequiredEnv('VITE_SUPABASE_URL')
const supabaseAnonKey = readRequiredEnv('VITE_SUPABASE_ANON_KEY')

// Database generic'i sorgu sonuclarini tipler; kolon adi hatalari artik
// derleme zamaninda yakalanir. src/types/database.ts otomatik uretilir.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
