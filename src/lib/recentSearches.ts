import { getLocalStorage } from '../data/localStorage'

// Adres Bul'un son aramaları. Yalnızca bu bilgisayarda, tarayıcı deposunda;
// kaybolursa hiçbir şey bozulmaz (liste boş görünür).

const STORAGE_KEY = 'stokadres-recent-searches'
export const RECENT_SEARCH_LIMIT = 8

export function loadRecentSearches(storage: Storage | undefined = getLocalStorage()): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, RECENT_SEARCH_LIMIT) : []
  } catch {
    return []
  }
}

/** Aramayı en başa ekler (büyük/küçük harf farkı olan tekrarı siler) ve yeni listeyi döndürür. */
export function rememberSearch(query: string, storage: Storage | undefined = getLocalStorage()): string[] {
  const trimmed = query.trim()
  const current = loadRecentSearches(storage)
  if (!trimmed) return current
  // Yalnızca istemci içi karşılaştırma: tr-TR burada doğru (CLAUDE.md Tuzak #5).
  const key = trimmed.toLocaleLowerCase('tr-TR')
  const next = [trimmed, ...current.filter((item) => item.toLocaleLowerCase('tr-TR') !== key)].slice(0, RECENT_SEARCH_LIMIT)
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Depo dolu ya da kapalı: liste yalnızca bu oturumda yaşar.
  }
  return next
}
