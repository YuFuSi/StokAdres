#!/usr/bin/env node
// Tek seferlik toplu ürün + barkod yükleyici — UYGULAMANIN PARÇASI DEĞİLDİR.
//
// NEDEN AYRI BİR SCRIPT
// Uygulamanın içe aktarma ekranı önizleme ve satır bazlı düzeltme için tasarlandı;
// 100.000 satırlık ilk yükleme onun işi değil. Bu script toplu insert yapar ve
// yalnızca bir kez çalıştırılır.
//
// KULLANIM
//   node scripts/bulk-load-products.mjs "stok kaydı.xlsx" --dry-run   # önce bunu
//   node scripts/bulk-load-products.mjs "stok kaydı.xlsx"
//
// .xlsx, .xls ve .csv doğrudan okunur — Excel'i CSV'ye çevirmeye gerek yok.
// (Bu, "düz CSV kaydedince Türkçe karakterler bozuluyor" tuzağını ortadan
// kaldırır.)
//
// DOSYA YAPISI
// Beklenen: her satır bir (stok, barkod) çifti. Aynı ürün birden fazla barkoda
// sahipse birden fazla satırda görünür — hepsi yüklenir.
//   Stok Kodu · Stok İsmi · Barkod
//
// GÜVENLİK
// .env'deki anon anahtarı kullanır. Yalnızca INSERT yapar; hiçbir satırı silmez
// veya güncellemez. Zaten kayıtlı stok kodlarını ve barkodları atlar, bu yüzden
// tekrar çalıştırmak güvenlidir.

import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const BATCH_SIZE = 500
const VALID_BARCODE = /^\d{6,14}$/

const COLUMN_ALIASES = {
  stockCode: ['stok kodu', 'stock_code', 'stok_kodu', 'stockcode', 'kod', 'ürün kodu', 'urun kodu'],
  stockName: ['stok ismi', 'stok adı', 'stok adi', 'stock_name', 'stok_adi', 'stockname', 'ürün adı', 'urun adi'],
  barcode: ['barkod', 'barcode', 'ean'],
}

function readEnv() {
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const values = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  if (!values.VITE_SUPABASE_URL || !values.VITE_SUPABASE_ANON_KEY) {
    throw new Error('.env icinde VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY bulunamadi.')
  }
  return { url: values.VITE_SUPABASE_URL, key: values.VITE_SUPABASE_ANON_KEY }
}

function mapColumns(headerRow) {
  const normalized = headerRow.map((h) =>
    String(h).replace(/^﻿/, '').toLocaleLowerCase('tr-TR').replace(/[._-]/g, ' ').replace(/\s+/g, ' ').trim())
  const columns = {}
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = normalized.findIndex((h) => aliases.includes(h))
    if (index >= 0) columns[key] = index
  }
  return { columns, normalized }
}

// Postgres `lower()` ile ayni sonucu verir (DB collation en_US.UTF-8).
// Turkce locale KULLANILMAZ: 'I'.toLocaleLowerCase('tr-TR') noktasiz 'ı' verir
// ve hicbir zaman eslesmez.
const norm = (value) => value.trim().toLowerCase()

function main() {
  const [filePath, ...flags] = process.argv.slice(2)
  const dryRun = flags.includes('--dry-run')
  if (!filePath) {
    console.error('Kullanim: node scripts/bulk-load-products.mjs <dosya.xlsx> [--dry-run]')
    process.exit(1)
  }
  return run(filePath, dryRun)
}

async function run(filePath, dryRun) {
  const workbook = XLSX.readFile(filePath, { raw: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Dosyada okunabilir bir sayfa yok.')
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  if (matrix.length < 2) throw new Error('Dosyada baslik ve veri satiri yok.')

  const { columns, normalized } = mapColumns(matrix[0])
  if (columns.stockCode === undefined || columns.stockName === undefined) {
    console.error('HATA: Zorunlu kolon bulunamadi.')
    console.error('  Dosyadaki basliklar:', normalized.join(' | '))
    console.error('  Gereken            : stok kodu, stok ismi')
    process.exit(1)
  }
  console.log(`Kolonlar: stok kodu=${columns.stockCode}, stok ismi=${columns.stockName}, barkod=${columns.barcode ?? 'yok'}`)

  const rows = matrix.slice(1).map((cells, index) => ({
    line: index + 2,
    code: String(cells[columns.stockCode] ?? '').trim(),
    name: String(cells[columns.stockName] ?? '').trim(),
    barcode: columns.barcode === undefined ? '' : String(cells[columns.barcode] ?? '').trim(),
  }))

  const skipped = []
  const note = (line, code, value, reason) => skipped.push({ line, code, value, reason })

  // --- 1) Kolonlari yer degismis satirlari ele ---
  // Bazi satirlarda stok kodu hucresinde barkod, barkod hucresinde stok kodu var.
  // Olduğu gibi yuklenirse stok kodu barkod olan cop urunler olusur.
  const isBarcodeLike = (value) => /^\d{12,14}$/.test(value)
  const isStockCodeLike = (value) => /^Z[ÜU]C{1,2}\d+$/i.test(value)
  const usable = []
  for (const row of rows) {
    if (isBarcodeLike(row.code) && isStockCodeLike(row.barcode)) {
      note(row.line, row.code, row.barcode, 'Kolonlar yer degismis (kod hucresinde barkod)')
      continue
    }
    if (!row.code || !row.name) {
      note(row.line, row.code, row.name, 'Stok kodu veya ismi bos')
      continue
    }
    usable.push(row)
  }

  // --- 2) Urunler (koda gore tekillestir) ---
  const products = new Map()
  for (const row of usable) {
    const key = norm(row.code)
    if (!products.has(key)) products.set(key, { code: row.code, name: row.name })
  }

  // --- 3) Barkodlar ---
  // Bozuk bicimli barkodlar TEMIZLENMEZ. Dosyadaki "Ç", "BARKOD ÇAKIŞIYOR" gibi
  // ekler rastgele degil: birisi cakisan barkodlari elle isaretlemis. Temizlenirse
  // 268 cakisma olusuyor; oldugu gibi atlaninca yalnizca 1 kaliyor.
  const barcodeOwners = new Map()
  for (const row of usable) {
    if (!row.barcode) continue
    if (!VALID_BARCODE.test(row.barcode)) {
      note(row.line, row.code, row.barcode, 'Barkod bicimi gecersiz (6-14 rakam disi)')
      continue
    }
    const key = norm(row.barcode)
    if (!barcodeOwners.has(key)) barcodeOwners.set(key, { value: row.barcode, codes: new Set(), lines: [] })
    barcodeOwners.get(key).codes.add(norm(row.code))
    barcodeOwners.get(key).lines.push(row.line)
  }

  const barcodePairs = []
  for (const [key, entry] of barcodeOwners) {
    if (entry.codes.size > 1) {
      note(entry.lines[0], [...entry.codes].join(' + '), entry.value, `Ayni barkod ${entry.codes.size} farkli urunde`)
      continue
    }
    barcodePairs.push({ code: [...entry.codes][0], barcode: entry.value, key })
  }

  console.log('')
  console.log(`Dosya satiri        : ${rows.length}`)
  console.log(`Benzersiz urun      : ${products.size}`)
  console.log(`Yuklenebilir barkod : ${barcodePairs.length}`)
  console.log(`Atlanan kayit       : ${skipped.length}`)
  if (skipped.length) {
    const byReason = {}
    for (const s of skipped) byReason[s.reason] = (byReason[s.reason] ?? 0) + 1
    for (const [reason, count] of Object.entries(byReason)) console.log(`   - ${reason}: ${count}`)
  }

  // --- 4) Veritabaninda zaten olanlari ele ---
  const { url, key } = readEnv()
  const supabase = createClient(url, key)

  console.log('\nMevcut kayitlar okunuyor...')
  const existingProducts = new Map()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('products').select('id, stock_code').order('stock_code').order('id').range(from, from + 999)
    if (error) throw new Error(`Mevcut urunler okunamadi: ${error.message}`)
    for (const record of data ?? []) existingProducts.set(norm(record.stock_code), record.id)
    if ((data ?? []).length < 1000) break
  }
  const existingBarcodes = new Set()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('product_barcodes').select('barcode').order('barcode').range(from, from + 999)
    if (error) throw new Error(`Mevcut barkodlar okunamadi: ${error.message}`)
    for (const record of data ?? []) existingBarcodes.add(norm(record.barcode))
    if ((data ?? []).length < 1000) break
  }
  console.log(`Veritabaninda ${existingProducts.size} urun, ${existingBarcodes.size} barkod var.`)

  const newProducts = [...products.values()].filter((p) => !existingProducts.has(norm(p.code)))
  const newBarcodes = barcodePairs.filter((pair) => !existingBarcodes.has(pair.key))

  console.log('')
  console.log(`YAZILACAK URUN   : ${newProducts.length}  (${products.size - newProducts.length} zaten kayitli)`)
  console.log(`YAZILACAK BARKOD : ${newBarcodes.length}  (${barcodePairs.length - newBarcodes.length} zaten kayitli)`)

  // Atlananlari rapor dosyasina yaz
  if (skipped.length) {
    const reportPath = filePath.replace(/\.[^.]+$/, '') + '-atlananlar.csv'
    const csv = ['Satir,Stok Kodu,Deger,Sebep']
      .concat(skipped.map((s) => [s.line, s.code, s.value, s.reason].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')))
      .join('\r\n')
    writeFileSync(reportPath, '﻿' + csv, 'utf8')
    console.log(`\nAtlanan kayitlar raporu: ${reportPath}`)
  }

  if (dryRun) { console.log('\n--dry-run: hicbir sey yazilmadi.'); return }
  if (newProducts.length === 0 && newBarcodes.length === 0) { console.log('\nYapilacak is yok.'); return }

  // --- 5) Urunleri yaz ---
  let written = 0
  const failures = []
  for (let start = 0; start < newProducts.length; start += BATCH_SIZE) {
    const batch = newProducts.slice(start, start + BATCH_SIZE)
    const { error } = await supabase.from('products').insert(batch.map((p) => ({ stock_code: p.code, stock_name: p.name })))
    if (error) {
      failures.push(`urun ${start + 1}-${start + batch.length}: ${error.message}`)
      process.stdout.write(`\r  urun ${written}/${newProducts.length}  (parti HATA)                    \n`)
    } else {
      written += batch.length
      process.stdout.write(`\r  urun ${written}/${newProducts.length} yazildi...`)
    }
  }
  console.log('')

  if (newBarcodes.length === 0) { console.log(`\nBITTI. ${written} urun yazildi.`); return }

  // --- 6) Barkodlari yaz (urun id'leri yeniden okunarak) ---
  console.log('\nUrun id\'leri okunuyor...')
  const idByCode = new Map()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('products').select('id, stock_code').order('stock_code').order('id').range(from, from + 999)
    if (error) throw new Error(`Urun id'leri okunamadi: ${error.message}`)
    for (const record of data ?? []) idByCode.set(norm(record.stock_code), record.id)
    if ((data ?? []).length < 1000) break
  }

  const barcodeRows = newBarcodes
    .map((pair) => ({ product_id: idByCode.get(pair.code), barcode: pair.barcode }))
    .filter((row) => row.product_id)

  let barcodesWritten = 0
  for (let start = 0; start < barcodeRows.length; start += BATCH_SIZE) {
    const batch = barcodeRows.slice(start, start + BATCH_SIZE)
    const { error } = await supabase.from('product_barcodes').insert(batch)
    if (error) {
      failures.push(`barkod ${start + 1}-${start + batch.length}: ${error.message}`)
      process.stdout.write(`\r  barkod ${barcodesWritten}/${barcodeRows.length}  (parti HATA)                    \n`)
    } else {
      barcodesWritten += batch.length
      process.stdout.write(`\r  barkod ${barcodesWritten}/${barcodeRows.length} yazildi...`)
    }
  }
  console.log('')

  console.log(`\nBITTI. ${written} urun, ${barcodesWritten} barkod yazildi.`)
  if (failures.length) {
    console.log(`\n${failures.length} parti basarisiz:`)
    for (const failure of failures.slice(0, 10)) console.log('  ' + failure)
    console.log('\nSebebi duzeltip scripti tekrar calistirin; yazilmis kayitlar otomatik atlanir.')
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('\nHATA:', error.message)
  process.exit(1)
})
