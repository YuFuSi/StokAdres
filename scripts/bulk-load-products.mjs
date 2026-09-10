#!/usr/bin/env node
// Tek seferlik toplu ürün yükleyici — UYGULAMANIN PARÇASI DEĞİLDİR.
//
// NEDEN AYRI BİR SCRIPT
// Uygulamanın içe aktarma ekranı ürün başına 3-4 HTTP isteği atar; 100.000
// üründe bu saatler sürer. Tek seferlik ilk yükleme için doğru araç, toplu
// insert yapan bu script. Supabase panelinin CSV yükleyicisi de kullanılabilir
// ama 100k satırda zorlanır ve hangi satırın neden reddedildiğini söylemez.
//
// KULLANIM
//   node scripts/bulk-load-products.mjs urunler.csv --dry-run   # önce bunu
//   node scripts/bulk-load-products.mjs urunler.csv
//
// CSV BEKLENTİSİ
//   Başlık satırı zorunlu. Tanınan kolon adları (büyük/küçük harf farketmez):
//     stok kodu / stock_code / stok_kodu / kod
//     stok adı  / stock_name / stok_adi  / ürün adı
//     barkod    / barcode                          (opsiyonel)
//
//   ÖNEMLİ: Excel'den kaydederken "CSV UTF-8 (virgülle ayrılmış)" seçin.
//   Düz "CSV" seçeneği Türkçe karakterleri bozar (Ç, Ğ, İ, Ö, Ş, Ü).
//
// GÜVENLİK
//   .env dosyasındaki anon anahtarı kullanır. Yalnızca INSERT yapar; hiçbir
//   satırı silmez veya güncellemez. Zaten kayıtlı stok kodlarını atlar.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BATCH_SIZE = 500

const COLUMN_ALIASES = {
  stockCode: ['stok kodu', 'stock_code', 'stok_kodu', 'stockcode', 'kod', 'ürün kodu', 'urun kodu'],
  stockName: ['stok adı', 'stok adi', 'stock_name', 'stok_adi', 'stockname', 'stok ismi', 'ürün adı', 'urun adi'],
  barcode: ['barkod', 'barcode', 'ean'],
}

function readEnv() {
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const values = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  const url = values.VITE_SUPABASE_URL
  const key = values.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('.env icinde VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY bulunamadi.')
  return { url, key }
}

/** Tirnakli alanlari ve alan icindeki satir sonlarini destekleyen CSV cozumleyici. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1 } else { inQuotes = false }
      } else field += char
      continue
    }
    if (char === '"') { inQuotes = true; continue }
    if (char === ',' || char === ';' || char === '\t') { row.push(field); field = ''; continue }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    if (char === '\r') continue
    field += char
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

function mapColumns(headerRow) {
  const normalized = headerRow.map((header) =>
    header.replace(/^﻿/, '').toLocaleLowerCase('tr-TR').replace(/[._-]/g, ' ').replace(/\s+/g, ' ').trim(),
  )
  const columns = {}
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = normalized.findIndex((header) => aliases.includes(header))
    if (index >= 0) columns[key] = index
  }
  return { columns, normalized }
}

async function main() {
  const [csvPath, ...flags] = process.argv.slice(2)
  const dryRun = flags.includes('--dry-run')
  if (!csvPath) {
    console.error('Kullanim: node scripts/bulk-load-products.mjs <dosya.csv> [--dry-run]')
    process.exit(1)
  }

  const text = readFileSync(csvPath, 'utf8')
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('Dosyada baslik ve en az bir veri satiri olmali.')

  const { columns, normalized } = mapColumns(rows[0])
  if (columns.stockCode === undefined || columns.stockName === undefined) {
    console.error('HATA: Zorunlu kolon bulunamadi.')
    console.error('  Dosyadaki basliklar :', normalized.join(' | '))
    console.error('  Gereken             : stok kodu, stok adi')
    process.exit(1)
  }
  console.log(`Kolonlar: stok kodu=${columns.stockCode}, stok adi=${columns.stockName}` +
    (columns.barcode !== undefined ? `, barkod=${columns.barcode}` : ', barkod=yok'))

  // 1) Ayristir ve dosya ici tekrarlari ele
  const seen = new Map()
  const invalid = []
  const duplicates = []
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i]
    const stockCode = (cells[columns.stockCode] ?? '').trim()
    const stockName = (cells[columns.stockName] ?? '').trim()
    const barcode = columns.barcode !== undefined ? (cells[columns.barcode] ?? '').trim() : ''
    if (!stockCode || !stockName) { invalid.push({ line: i + 1, stockCode, stockName }); continue }
    const key = stockCode.toLocaleLowerCase('tr-TR')
    if (seen.has(key)) { duplicates.push({ line: i + 1, stockCode }); continue }
    seen.set(key, { stock_code: stockCode, stock_name: stockName, barcode })
  }

  console.log(`\nDosya   : ${rows.length - 1} veri satiri`)
  console.log(`Gecerli : ${seen.size}`)
  if (invalid.length) console.log(`Eksik alanli (atlanacak): ${invalid.length}  ornek satir ${invalid.slice(0, 3).map((r) => r.line).join(', ')}`)
  if (duplicates.length) console.log(`Dosya ici tekrar (atlanacak): ${duplicates.length}  ornek satir ${duplicates.slice(0, 3).map((r) => r.line).join(', ')}`)

  // 2) Veritabaninda zaten olanlari ele
  const { url, key } = readEnv()
  const supabase = createClient(url, key)

  console.log('\nMevcut stok kodlari okunuyor...')
  const existing = new Set()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('products').select('stock_code').order('stock_code').order('id').range(from, from + 999)
    if (error) throw new Error(`Mevcut urunler okunamadi: ${error.message}`)
    for (const record of data ?? []) existing.add(record.stock_code.toLocaleLowerCase('tr-TR'))
    if ((data ?? []).length < 1000) break
  }
  console.log(`Veritabaninda ${existing.size} urun var.`)

  const toInsert = [...seen.values()].filter((record) => !existing.has(record.stock_code.toLocaleLowerCase('tr-TR')))
  const alreadyThere = seen.size - toInsert.length
  if (alreadyThere) console.log(`Zaten kayitli (atlanacak): ${alreadyThere}`)
  console.log(`\nYUKLENECEK: ${toInsert.length} urun`)

  if (dryRun) { console.log('\n--dry-run: hicbir sey yazilmadi.'); return }
  if (toInsert.length === 0) { console.log('Yapilacak is yok.'); return }

  // 3) Partiler halinde yaz
  let inserted = 0
  const failedBatches = []
  for (let start = 0; start < toInsert.length; start += BATCH_SIZE) {
    const batch = toInsert.slice(start, start + BATCH_SIZE)
    const { error } = await supabase
      .from('products')
      .insert(batch.map(({ stock_code, stock_name }) => ({ stock_code, stock_name })))
    if (error) {
      failedBatches.push({ start: start + 1, end: start + batch.length, message: error.message })
      process.stdout.write(`\r  ${inserted}/${toInsert.length}  (parti ${start + 1}-${start + batch.length} HATA)          \n`)
    } else {
      inserted += batch.length
      process.stdout.write(`\r  ${inserted}/${toInsert.length} urun yazildi...`)
    }
  }
  console.log('')

  // 4) Barkodlar (varsa) — urunler yazildiktan sonra, id eslestirerek
  const withBarcode = toInsert.filter((record) => record.barcode)
  if (withBarcode.length && inserted > 0) {
    console.log(`\n${withBarcode.length} barkod yaziliyor...`)
    const idByCode = new Map()
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('products').select('id, stock_code').order('stock_code').order('id').range(from, from + 999)
      if (error) throw new Error(`Urun id'leri okunamadi: ${error.message}`)
      for (const record of data ?? []) idByCode.set(record.stock_code.toLocaleLowerCase('tr-TR'), record.id)
      if ((data ?? []).length < 1000) break
    }
    const barcodeRows = withBarcode
      .map((record) => ({ product_id: idByCode.get(record.stock_code.toLocaleLowerCase('tr-TR')), barcode: record.barcode }))
      .filter((row) => row.product_id)

    let barcodesInserted = 0
    for (let start = 0; start < barcodeRows.length; start += BATCH_SIZE) {
      const batch = barcodeRows.slice(start, start + BATCH_SIZE)
      const { error } = await supabase.from('product_barcodes').insert(batch)
      if (error) {
        console.log(`  parti ${start + 1}-${start + batch.length} HATA: ${error.message}`)
      } else {
        barcodesInserted += batch.length
        process.stdout.write(`\r  ${barcodesInserted}/${barcodeRows.length} barkod yazildi...`)
      }
    }
    console.log('')
  }

  console.log(`\nBITTI. ${inserted} urun yazildi.`)
  if (failedBatches.length) {
    console.log(`\n${failedBatches.length} parti basarisiz:`)
    for (const batch of failedBatches.slice(0, 10)) console.log(`  satir ${batch.start}-${batch.end}: ${batch.message}`)
    console.log('\nBasarisiz partiler icin sebebi duzeltip scripti tekrar calistirin;')
    console.log('zaten yazilmis urunler otomatik atlanir.')
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('\nHATA:', error.message)
  process.exit(1)
})
