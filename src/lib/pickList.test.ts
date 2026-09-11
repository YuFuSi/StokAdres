import { describe, expect, it } from 'vitest'
import type { CabaMatch } from '../services/cabaLookup'
import { buildPickList } from './pickList'

const match = (rowNumber: number, stockCode: string, addresses: Array<[string, number]>): CabaMatch => ({
  rowNumber,
  stockCode,
  cabaQuantity: String(rowNumber * 10),
  product: { id: `p-${stockCode}`, stockCode, stockName: `${stockCode} adı` },
  addresses: addresses.map(([address, cartonCount], index) => ({ id: `${stockCode}-${index}`, address, cartonCount })),
})

describe('buildPickList', () => {
  it('fiş sırasını değil depo rotasını izler', () => {
    const { rows } = buildPickList([
      match(1, 'TEKS1', [['J09-02', 3]]),
      match(2, 'TEKS2', [['F13-01', 5]]),
      match(3, 'TEKS3', [['F14-DİBİ', 1]]),
    ])
    expect(rows.map((row) => row.address)).toEqual(['F13-01', 'F14-DİBİ', 'J09-02'])
  })

  it('çok konumlu ürünü her konumda ayrı satıra böler', () => {
    const { rows } = buildPickList([match(1, 'ELK1', [['G06-01', 2], ['F13-04', 4]])])
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => [row.address, row.locationCount, row.cabaQuantity])).toEqual([['F13-04', 2, '10'], ['G06-01', 2, '10']])
  })

  it('koridorlara göre gruplar, biçim dışı adresleri sona koyar', () => {
    const { groups } = buildPickList([
      match(1, 'A', [['RAMPA', 1]]),
      match(2, 'B', [['G06-01', 1]]),
      match(3, 'C', [['F13-01', 1], ['F20-02', 1]]),
    ])
    expect(groups.map((group) => [group.aisle, group.rows.length])).toEqual([['F', 2], ['G', 1], [null, 1]])
  })

  it('aynı konumdaki ürünleri stok koduna göre dizer', () => {
    const { rows } = buildPickList([match(1, 'ZÜC2', [['F13-01', 1]]), match(2, 'ELK9', [['F13-01', 1]])])
    expect(rows.map((row) => row.stockCode)).toEqual(['ELK9', 'ZÜC2'])
  })

  it('boş eşleşmede boş liste döner', () => {
    expect(buildPickList([])).toEqual({ rows: [], groups: [] })
  })
})
