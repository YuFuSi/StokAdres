import { describe, expect, it } from 'vitest'
import { parseRangeBound, resolveAddressRange } from './addressRange'

describe('parseRangeBound', () => {
  it('tam adresi rota anahtarına çevirir', () => {
    expect(parseRangeBound('G01-01', 'from')).toBe('G0101')
    expect(parseRangeBound('F14-DİBİ', 'from')).toBe('F1400')
    expect(parseRangeBound('f14 dibi', 'to')).toBe('F1400')
  })

  it('kısmi girişi kenara göre doldurur', () => {
    expect(parseRangeBound('G', 'from')).toBe('G0000')
    expect(parseRangeBound('G', 'to')).toBe('G9999')
    expect(parseRangeBound('G05', 'from')).toBe('G0500')
    expect(parseRangeBound('G5', 'to')).toBe('G0599')
  })

  it('yazım çeşitlerini kabul eder', () => {
    expect(parseRangeBound('g0101', 'from')).toBe('G0101')
    expect(parseRangeBound('i05-2', 'from')).toBe('I0502')
    expect(parseRangeBound('İ05', 'to')).toBe('I0599')
    expect(parseRangeBound('017-03', 'from')).toBe('O1703')
  })

  it('tanınmayan girişte null döner', () => {
    expect(parseRangeBound('', 'from')).toBeNull()
    expect(parseRangeBound('RAMPA', 'from')).toBeNull()
    expect(parseRangeBound('G123', 'from')).toBeNull()
  })
})

describe('resolveAddressRange', () => {
  it('bitiş boşsa başlangıç koridorunun sonuna kadar gider', () => {
    expect(resolveAddressRange('G01-01', '')).toEqual({ range: { fromKey: 'G0101', toKey: 'G9999', label: 'G01-01 → G sonu' } })
  })

  it('iki uç verilince aralık kurar', () => {
    expect(resolveAddressRange('F', 'H10')).toEqual({ range: { fromKey: 'F0000', toKey: 'H1099', label: 'F başı → H10' } })
  })

  it('ters aralıkta ve tanınmayan girişte hata verir', () => {
    expect(resolveAddressRange('H01', 'G')).toHaveProperty('error')
    expect(resolveAddressRange('', 'G')).toHaveProperty('error')
    expect(resolveAddressRange('RAMPA', '')).toHaveProperty('error')
    expect(resolveAddressRange('G01', 'XYZ')).toHaveProperty('error')
  })

  it('DİBİ katı aralığın içinde kalır', () => {
    const result = resolveAddressRange('F14', 'F14')
    expect(result).toEqual({ range: { fromKey: 'F1400', toKey: 'F1499', label: 'F14 → F14' } })
    expect('F1400' >= 'F1400' && 'F1400' <= 'F1499').toBe(true)
  })
})
