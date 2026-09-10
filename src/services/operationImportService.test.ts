import { describe, expect, it } from 'vitest'
import { OperationImportFileError, parseOperationImportText, validateOperationRow } from './operationImportService'

// Ayristirma, kullanicinin akisinin ilk adimi: Gemini/CABA ciktisi buradan
// geciyor. Burada sessizce yanlis davranmak, sonraki her adimi bozar.

const tsv = (...lines: string[]) => lines.join('\n')

describe('parseOperationImportText', () => {
  it('Excel yapistirmasini (sekmeyle ayrilmis) okur', () => {
    const rows = parseOperationImportText(tsv(
      'Stok Kodu\tAdres\tKoli Adedi',
      'ZÜCC001\tA01-01\t12',
      'ZÜCC002\tA01-02\t5',
    ))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ rowNumber: 2, stockCode: 'ZÜCC001', address: 'A01-01', cartonCount: 12 })
    expect(rows[1]).toMatchObject({ rowNumber: 3, stockCode: 'ZÜCC002', cartonCount: 5 })
  })

  it('kolon adlarini es anlamlilariyla tanir ve sirasi onemli degil', () => {
    const rows = parseOperationImportText(tsv(
      'BARKOD\tKod\tStok İsmi',
      '8690000000001\tZÜCC003\tCAM BARDAK',
    ))
    expect(rows[0]).toMatchObject({ stockCode: 'ZÜCC003', stockName: 'CAM BARDAK', barcode: '8690000000001' })
  })

  it('Stok Kodu kolonu yoksa bulunan basliklari soyleyerek hata verir', () => {
    // Kok sebep gizlenmemeli: kullanici yuzlerce "stok kodu bos" satiri yerine
    // kolonun eksik oldugunu ogrenmeli.
    expect(() => parseOperationImportText(tsv('Ürün Adı\tMiktar', 'Bir şey\t5')))
      .toThrowError(/Stok Kodu.*bulunamadı.*Ürün Adı, Miktar/s)
  })

  it('yalnizca baslik satiri varsa hata verir', () => {
    expect(() => parseOperationImportText('Stok Kodu\tAdres')).toThrow(OperationImportFileError)
  })

  it('bos girdiyi reddeder', () => {
    expect(() => parseOperationImportText('   ')).toThrow(OperationImportFileError)
  })

  it('tamamen bos satirlari atlar ama satir numaralarini korur', () => {
    const rows = parseOperationImportText(tsv(
      'Stok Kodu\tAdres\tKoli Adedi',
      'ZÜCC001\tA01-01\t12',
      '\t\t',
      'ZÜCC002\tA01-02\t5',
    ))
    expect(rows).toHaveLength(2)
    // Ikinci kayit dosyada 4. satirda; duzeltme icin bu numara dogru olmali.
    expect(rows[1].rowNumber).toBe(4)
  })

  it('ondalik ayraci olarak virgulu kabul eder', () => {
    const rows = parseOperationImportText(tsv('Stok Kodu\tKoli\nZÜCC001\t12,0'))
    expect(rows[0].cartonCount).toBe(12)
  })

  it('sayiya cevrilemeyen koli degerinde ham metni korur', () => {
    // cartonCount NaN olur ama cabaQuantity kullanicinin yazdigini tutar;
    // onizlemede "NaN" degil "abc" gorunmesini bu saglar.
    const rows = parseOperationImportText(tsv('Stok Kodu\tKoli', 'ZÜCC001\tabc'))
    expect(rows[0].cabaQuantity).toBe('abc')
    expect(Number.isNaN(rows[0].cartonCount)).toBe(true)
  })
})

describe('validateOperationRow', () => {
  const row = (over: Partial<Parameters<typeof validateOperationRow>[1]> = {}) => ({
    rowNumber: 2, stockCode: 'ZÜCC001', stockName: 'AD', barcode: '', address: '', cartonCount: null, cabaQuantity: '', ...over,
  })

  it('stok kodu her islemde zorunlu', () => {
    for (const operation of ['stocks', 'names', 'barcodes', 'addresses'] as const) {
      expect(validateOperationRow(operation, row({ stockCode: '' }))).toContain('Stok kodu boş.')
    }
  })

  it('adres isleminde adres ve pozitif tam sayi koli ister', () => {
    expect(validateOperationRow('addresses', row({ address: '', cartonCount: 5 }))).toContain('Adres boş.')
    expect(validateOperationRow('addresses', row({ address: 'A1', cartonCount: 0 }))).toContain('Koli adedi pozitif tam sayı olmalı.')
    expect(validateOperationRow('addresses', row({ address: 'A1', cartonCount: -3 }))).toContain('Koli adedi pozitif tam sayı olmalı.')
    expect(validateOperationRow('addresses', row({ address: 'A1', cartonCount: 1.5 }))).toContain('Koli adedi pozitif tam sayı olmalı.')
    expect(validateOperationRow('addresses', row({ address: 'A1', cartonCount: NaN }))).toContain('Koli adedi pozitif tam sayı olmalı.')
    expect(validateOperationRow('addresses', row({ address: 'A1', cartonCount: 4 }))).toEqual([])
  })

  it('barkod isleminde barkod zorunlu', () => {
    expect(validateOperationRow('barcodes', row({ barcode: '' }))).toContain('Barkod boş.')
    expect(validateOperationRow('barcodes', row({ barcode: '8690000000001' }))).toEqual([])
  })

  it('stok/isim islemlerinde stok adi zorunlu', () => {
    expect(validateOperationRow('names', row({ stockName: '' }))).toContain('Stok adı boş.')
    expect(validateOperationRow('stocks', row({ stockName: '' }))).toContain('Stok adı boş.')
  })
})
