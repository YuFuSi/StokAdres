import { describe, expect, it } from 'vitest'
import { loadRecentSearches, RECENT_SEARCH_LIMIT, rememberSearch } from './recentSearches'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key) },
    setItem: (key, value) => { data.set(key, value) },
  }
}

describe('recentSearches', () => {
  it('en yeni aramayı başa ekler', () => {
    const storage = memoryStorage()
    rememberSearch('G27-04', storage)
    expect(rememberSearch('TEKS10465', storage)).toEqual(['TEKS10465', 'G27-04'])
    expect(loadRecentSearches(storage)).toEqual(['TEKS10465', 'G27-04'])
  })

  it('büyük/küçük harf farklı tekrarı tek kayda indirir', () => {
    const storage = memoryStorage()
    rememberSearch('kalem', storage)
    rememberSearch('G27', storage)
    expect(rememberSearch('KALEM', storage)).toEqual(['KALEM', 'G27'])
  })

  it('listeyi sınırda tutar ve boş aramayı kaydetmez', () => {
    const storage = memoryStorage()
    for (let index = 0; index < RECENT_SEARCH_LIMIT + 3; index += 1) rememberSearch(`ARAMA${index}`, storage)
    expect(loadRecentSearches(storage)).toHaveLength(RECENT_SEARCH_LIMIT)
    expect(rememberSearch('   ', storage)).toHaveLength(RECENT_SEARCH_LIMIT)
  })

  it('bozuk ya da erişilemeyen depoda boş liste döner', () => {
    expect(loadRecentSearches(memoryStorage({ 'stokadres-recent-searches': '{bozuk' }))).toEqual([])
    expect(loadRecentSearches(undefined)).toEqual([])
    expect(rememberSearch('G27', undefined)).toEqual(['G27'])
  })
})
