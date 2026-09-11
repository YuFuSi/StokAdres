import { describe, expect, it } from 'vitest'
import { stockCodeVariants } from './stockCodeVariants'

describe('stockCodeVariants', () => {
  it('sayı kısmındaki harf/rakam karışıklığını düzeltir', () => {
    expect(stockCodeVariants('TEKSI0465')).toContain('TEKS10465')
    expect(stockCodeVariants('ELK0O339')).toContain('ELK00339')
  })

  it('önekteki rakamı harfe çevirir', () => {
    expect(stockCodeVariants('0YN013989')).toContain('OYN013989')
    expect(stockCodeVariants('0YN013989')).toContain('OYN-013989')
  })

  it('U yerine Ü dener', () => {
    expect(stockCodeVariants('ZUCC90592')).toContain('ZÜCC90592')
    expect(stockCodeVariants('zucc9o592')).toContain('ZÜCC90592')
  })

  it('önek ile sayı arasındaki tireyi ekler ve kaldırır', () => {
    expect(stockCodeVariants('ELK00816')).toContain('ELK-00816')
    expect(stockCodeVariants('ELK-00339')).toContain('ELK00339')
  })

  it('sayısal kodlarda baştaki sıfırları tamamlar', () => {
    expect(stockCodeVariants('1614')).toEqual(expect.arrayContaining(['001614', '0001614']))
  })

  it('boşlukları siler, girilen kodun kendisini döndürmez', () => {
    const variants = stockCodeVariants(' TEKS 10465 ')
    expect(variants).not.toContain('TEKS10465')
    expect(variants).toContain('TEKS-10465')
  })

  it('rakam içermeyen girişte aday üretmez', () => {
    expect(stockCodeVariants('KALEM')).toEqual([])
    expect(stockCodeVariants('')).toEqual([])
  })

  it('aday sayısı sınırlı kalır', () => {
    expect(stockCodeVariants('ZUCC5S8B1I0O').length).toBeLessThanOrEqual(60)
  })
})
