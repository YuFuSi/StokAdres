import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void }
const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  useEffect(() => {
    const resolved = theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : theme
    document.documentElement.dataset.theme = resolved
  }, [theme])
  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme: () => setTheme((value) => value === 'dark' ? 'light' : 'dark') }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
