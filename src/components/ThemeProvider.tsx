import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getLocalStorage } from '../data/localStorage'

type Theme = 'light' | 'dark' | 'system'
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
    const resolved = theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : theme
    document.documentElement.dataset.theme = resolved
    try {
      getLocalStorage()?.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Tercih kalıcı olmasa da uygulama çalışmaya devam etmeli.
    }
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme: () => setTheme((value) => value === 'dark' ? 'light' : 'dark') }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
