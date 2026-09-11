import { describe, expect, it } from 'vitest'
import { aisleOf, compareAddresses, normalizeAddressInput, parseAddress } from './addressFormat'

describe('parseAddress', () => {
  it('kanonik adresi parçalar', () => {
    expect(parseAddress('F13-01')).toEqual({ aisle: 'F', rack: 13, level: 1 })
    expect(parseAddress('F14-DİBİ')).toEqual({ aisle: 'F', rack: 14, level: 0 })
  })

  it('biçim dışı adreste null döner', () => {
    expect(parseAddress('H21-1')).toBeNull()
    expect(parseAddress('f13-01')).toBeNull()
    expect(parseAddress('H21-00')).toBeNull()
    expect(parseAddress('DEPO')).toBeNull()
  })
})

describe('normalizeAddressInput', () => {
  it('canlıdaki bozuk girişleri düzeltir', () => {
    expect(normalizeAddressInput('H21-1')).toEqual({ value: 'H21-01', changed: true, valid: true })
    expect(normalizeAddressInput('H34-1').value).toBe('H34-01')
  })

  it('kanonik adresi değiştirmez', () => {
    expect(normalizeAddressInput('F13-01')).toEqual({ value: 'F13-01', changed: false, valid: true })
    expect(normalizeAddressInput('  F13-01 ')).toEqual({ value: 'F13-01', changed: false, valid: true })
  })

  it('küçük harf ve ayırıcıları düzeltir', () => {
    expect(normalizeAddressInput('g27 04').value).toBe('G27-04')
    expect(normalizeAddressInput('J9/3').value).toBe('J09-03')
    expect(normalizeAddressInput('K17_02').value).toBe('K17-02')
    expect(normalizeAddressInput('H2101').value).toBe('H21-01')
  })

  it('Türkçe İ/ı ve 0/O karışıklığını çözer', () => {
    expect(normalizeAddressInput('i05 2').value).toBe('I05-02')
    expect(normalizeAddressInput('İ05-02').value).toBe('I05-02')
    expect(normalizeAddressInput('ı05-02').value).toBe('I05-02')
    expect(normalizeAddressInput('017-03').value).toBe('O17-03')
  })

  it('DİBİ katının yazım çeşitlerini birleştirir', () => {
    expect(normalizeAddressInput('f14 dibi').value).toBe('F14-DİBİ')
    expect(normalizeAddressInput('F14-DIBI').value).toBe('F14-DİBİ')
    expect(normalizeAddressInput('F14-DİBİ').changed).toBe(false)
  })

  it('tanınmayan girişi tahmin etmez', () => {
    expect(normalizeAddressInput('H211')).toEqual({ value: 'H211', changed: false, valid: false })
    expect(normalizeAddressInput('rampa önü')).toEqual({ value: 'RAMPA-ÖNÜ', changed: true, valid: false })
  })
})

describe('compareAddresses', () => {
  it('koridor, raf, kat sırasına dizer; DİBİ önce, biçim dışı sona', () => {
    const addresses = ['G06-01', 'RAMPA', 'F14-02', 'F14-DİBİ', 'F13-04', 'H21-1', 'F14-01']
    expect([...addresses].sort(compareAddresses)).toEqual(['F13-04', 'F14-DİBİ', 'F14-01', 'F14-02', 'G06-01', 'H21-1', 'RAMPA'])
  })

  it('raf numarasını sayı olarak karşılaştırır', () => {
    expect(compareAddresses('J09-01', 'J10-01')).toBeLessThan(0)
  })
})

describe('aisleOf', () => {
  it('koridor harfini döndürür', () => {
    expect(aisleOf('F13-01')).toBe('F')
    expect(aisleOf('h21-1')).toBe('H')
    expect(aisleOf('RAMPA')).toBeNull()
  })
})
