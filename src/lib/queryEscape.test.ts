import { describe, expect, it } from 'vitest'
import { escapePostgrestOrPattern } from './queryEscape'

describe('escapePostgrestOrPattern', () => {
  it('düz metinleri değiştirmeden döner ve baştaki/sondaki boşlukları kırpar', () => {
    expect(escapePostgrestOrPattern('  KOLI-123  ')).toBe('KOLI-123')
  })

  it('% joker karakterini ters eğik çizgi ile kaçırır', () => {
    expect(escapePostgrestOrPattern('100%pamuk')).toBe('100\\%pamuk')
  })

  it('_ joker karakterini ters eğik çizgi ile kaçırır', () => {
    expect(escapePostgrestOrPattern('stok_kodu')).toBe('stok\\_kodu')
  })

  it('PostgREST or() ayırıcısı olan virgülü kaçırır', () => {
    expect(escapePostgrestOrPattern('kutu, koli')).toBe('kutu\\, koli')
  })

  it('ters eğik çizgi karakterini kaçırır', () => {
    expect(escapePostgrestOrPattern('A\\B')).toBe('A\\\\B')
  })

  it('karışık özel karakter kombinasyonlarını doğru kaçırır', () => {
    expect(escapePostgrestOrPattern('50%, _özel_, test\\kategori')).toBe('50\\%\\, \\_özel\\_\\, test\\\\kategori')
  })
})
