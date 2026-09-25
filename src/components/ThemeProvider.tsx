import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getLocalStorage } from '../data/localStorage'

/** Kullanıcının seçtiği tercih. 'system' çözümlenmiş tema değil, tercihin kendisidir. */
export type ThemePreference = 'light' | 'dark' | 'system'
type Theme = ThemePreference
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void }
const ThemeContext = createContext<ThemeContextValue | null>(null)

export const THEME_STORAGE_KEY = 'stokadres-theme-v1'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

/**
 * Kaydedilmiş tercihi okur. Okuma başarısız olursa (özel pencere, site verisi
 * kapalı) sessizce 'light' döner — tema tercihi uygulamayı açmayı engelleyecek
 * kadar önemli değil.
 */
function readStoredTheme(): Theme {
  try {
    const stored = getLocalStorage()?.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : 'light'
  } catch {
    return 'light'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy initializer: ilk render zaten doğru temayla çizilir, açılışta
  // açık→koyu sıçraması olmaz.
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    const mediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null

    const updateResolvedTheme = () => {
      const isSystemDark = mediaQuery?.matches ?? false
      const resolved = theme === 'system' ? (isSystemDark ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
      const metaThemeColor = document.querySelector('meta[name="theme-color"]')
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', resolved === 'dark' ? '#171a1a' : '#f5f7f8')
      }
    }

    updateResolvedTheme()

    try {
      getLocalStorage()?.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Tercih kalıcı olmasa da uygulama çalışmaya devam etmeli.
    }

    // 'system' modundayken işletim sistemi açık/koyu mod değişimini canlı izle.
    if (theme === 'system' && mediaQuery) {
      const handleChange = () => {
        updateResolvedTheme()
      }
      mediaQuery.addEventListener('change', handleChange)
      return () => {
        mediaQuery.removeEventListener('change', handleChange)
      }
    }
  }, [theme])

  // Üç durumlu döngü: light → dark → system → light.
  // Ayarlar ekranındaki üç butonlu seçiciyle çakışmaz; kısayol veya hızlı geçişte tam döngü sağlar.
  const toggleTheme = () => {
    setTheme((current) => {
      if (current === 'light') return 'dark'
      if (current === 'dark') return 'system'
      return 'light'
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
