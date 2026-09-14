import { describe, expect, it } from 'vitest'
import type { CabaMatch } from '../services/cabaLookup'
import { buildPickList, buildProductList, countAisles, PRINTED_ADDRESS_LIMIT } from './pickList'

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

describe('buildProductList', () => {
  it('adresleri en çok koliden aza dizer, eşit kolide rota sırası', () => {
    const [group] = buildProductList([match(1, 'TEKS1', [['J09-02', 3], ['F13-01', 5], ['G01-01', 3], ['F14-DİBİ', 1]])])
    expect(group.stockCode).toBe('TEKS1')
    expect(group.addresses.map((address) => [address.address, address.cartonCount])).toEqual([['F13-01', 5], ['G01-01', 3], ['J09-02', 3], ['F14-DİBİ', 1]])
    expect(group.totalCartons).toBe(12)
    expect(group.cabaQuantity).toBe('10')
  })

  it('kâğıda en çok kolili 3 adresi koyar, kalanları sayar', () => {
    const [group] = buildProductList([match(1, 'X', [['F01-01', 10], ['F02-01', 50], ['F03-01', 20], ['F04-01', 40], ['F05-01', 30]])])
    expect(PRINTED_ADDRESS_LIMIT).toBe(3)
    expect(group.shown.map((address) => address.address)).toEqual(['F02-01', 'F04-01', 'F05-01'])
    expect(group.hiddenCount).toBe(2)
    expect(group.addresses).toHaveLength(5)
    expect(group.totalCartons).toBe(150)
  })

  it('3 adresten azsa hepsini gösterir', () => {
    const [group] = buildProductList([match(1, 'Y', [['G06-01', 2], ['F13-04', 4]])])
    expect(group.shown.map((address) => address.address)).toEqual(['F13-04', 'G06-01'])
    expect(group.hiddenCount).toBe(0)
  })

  it('ürünleri Adres 1e (en kolili adres) göre rota sırasında dizer', () => {
    const groups = buildProductList([
      match(1, 'B', [['H01-01', 1]]),
      match(2, 'A', [['K05-01', 9], ['F20-02', 1]]),
      match(3, 'C', [['G06-01', 1]]),
    ])
    expect(groups.map((group) => group.stockCode)).toEqual(['C', 'B', 'A'])
  })

  it('adresi olmayan ürünü listeye koymaz', () => {
    expect(buildProductList([match(1, 'BOS', [])])).toEqual([])
  })
})

describe('countAisles', () => {
  it('biçim dışı adresleri saymadan farklı koridorları sayar', () => {
    expect(countAisles([match(1, 'A', [['F13-01', 1], ['F14-02', 1]]), match(2, 'B', [['G06-01', 1], ['RAMPA', 1]])])).toBe(2)
  })
})
