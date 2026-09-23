// Boş konum raporu: bir koridorda aktif kaydı olmayan raf/kat konumları.
//
// Fiziksel raf ızgarası veritabanında YOK. "Boş" = ızgarada olup aktif kaydı
// olmayan konum; ızgara gözlenen veriden çıkarılır:
//   raflar 01..(koridorda görülen en büyük raf), katlar 01–04,
//   DİBİ yalnızca koridorda en az bir DİBİ kaydı varsa.
// Yani hiç kullanılmamış bir raf en sondaysa raporda görünmez.
//
// Saf modül: Supabase import etmez (CLAUDE.md Tuzak #11).

import { FLOOR_LEVEL, parseAddress } from './addressFormat'

export const SHELF_LEVELS = [1, 2, 3, 4]

export type EmptyRack = {
  rack: number
  /** Boş katlar, yazıldığı biçimde: "DİBİ", "01", "03". */
  emptyLevels: string[]
}

export type EmptyLocationReport = {
  aisle: string
  /** Izgaradaki toplam konum sayısı. */
  totalLocations: number
  filledLocations: number
  emptyLocations: number
  /** Yalnızca en az bir boş konumu olan raflar, raf sırasında. */
  racks: EmptyRack[]
  /** Izgaraya oturmayan (biçim dışı) aktif adresler; rapora dahil değil. */
  unparsed: string[]
}

export function findEmptyLocations(aisle: string, activeAddresses: string[]): EmptyLocationReport {
  const filled = new Set<string>()
  const unparsed: string[] = []
  let maxRack = 0
  let hasFloor = false

  for (const address of activeAddresses) {
    const parsed = parseAddress(address)
    if (!parsed || parsed.aisle !== aisle) { unparsed.push(address); continue }
    filled.add(`${parsed.rack}-${parsed.level}`)
    maxRack = Math.max(maxRack, parsed.rack)
    if (parsed.level === 0) hasFloor = true
  }

  const levels = hasFloor ? [0, ...SHELF_LEVELS] : SHELF_LEVELS
  const racks: EmptyRack[] = []
  for (let rack = 1; rack <= maxRack; rack += 1) {
    const emptyLevels = levels
      .filter((level) => !filled.has(`${rack}-${level}`))
      .map((level) => (level === 0 ? FLOOR_LEVEL : String(level).padStart(2, '0')))
    if (emptyLevels.length > 0) racks.push({ rack, emptyLevels })
  }

  const totalLocations = maxRack * levels.length
  const emptyLocations = racks.reduce((sum, rack) => sum + rack.emptyLevels.length, 0)
  return { aisle, totalLocations, filledLocations: totalLocations - emptyLocations, emptyLocations, racks, unparsed }
}

export function formatRack(rack: number): string {
  return String(rack).padStart(2, '0')
}
