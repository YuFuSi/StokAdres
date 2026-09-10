import { describe, expect, it } from 'vitest'
import { chunk, normalizeAddress, normalizeStockCode } from './productLookup'

// Normalizasyon kurallari veritabanindaki ifade index'leriyle BIREBIR ayni
// olmak zorunda. Sapma sessizdir: sorgu hata vermez, sadece "bulunamadi" der.

describe('normalizeStockCode', () => {
  it('bosluk kirpar ve kucuk harfe cevirir', () => {
    expect(normalizeStockCode('  ZÜCC403 ')).toBe('zücc403')
  })

  it('farkli yazimlari ayni degere indirger', () => {
    const forms = ['ZÜCC403', 'zücc403', 'ZüCc403', ' ZÜCC403']
    expect(new Set(forms.map(normalizeStockCode)).size).toBe(1)
  })

  it('Turkce locale KULLANMAZ — Postgres lower() ile ayni sonucu verir', () => {
    // Veritabani collation'i en_US.UTF-8; Postgres lower('IĞNE') -> 'iğne'
    // (noktali i). toLocaleLowerCase('tr-TR') ise 'ığne' (noktasiz) uretir ve
    // stock_code_normalized ile HICBIR ZAMAN eslesmez. Bu test o regresyonu
    // yakalar: bugun I iceren stok kodu yok ama 100k urun yuklendi ve Turkce
    // kodlarda "I" yaygin (IVORY, ISI, IC...).
    expect(normalizeStockCode('IĞNE')).toBe('iğne')
    expect(normalizeStockCode('IĞNE')).not.toBe('IĞNE'.toLocaleLowerCase('tr-TR'))
    expect(normalizeStockCode('ISI-01')).toBe('isi-01')
  })

  it('rakamsal kodlari degistirmez', () => {
    expect(normalizeStockCode('025019')).toBe('025019')
  })
})

describe('normalizeAddress', () => {
  it('kismi unique index ile ayni kurali uygular: lower(trim(address))', () => {
    expect(normalizeAddress('  G25-04 ')).toBe('g25-04')
    expect(normalizeAddress('G25-04')).toBe(normalizeAddress('g25-04'))
  })
})

describe('chunk', () => {
  it('listeyi verilen boyutta parcalara boler', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('bos liste icin bos dizi doner', () => {
    expect(chunk([], 10)).toEqual([])
  })

  it('parca boyutundan kucuk listeyi tek parca yapar', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]])
  })

  it('tam bolunen listede bos parca birakmaz', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })
})
