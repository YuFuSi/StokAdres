# StokAdres — Proje Hafızası

Bu dosya her oturumun başında otomatik yüklenir. Amacı: projeyi her seferinde
baştan analiz etmeye gerek kalmaması. **Her çalışma gününün sonunda alttaki
"Çalışma Günlüğü" bölümüne özet eklenir.**

---

## Proje Nedir

Depo stok ve fiziksel adresleme yönetimi için **yerel Electron masaüstü
uygulaması**. Kullanıcı: Harun abi (depo operasyonu). Arayüz tamamen Türkçe.

**Stack:** Electron 44 + React 19 + TypeScript 7 + Vite 8 + Vitest + Supabase (Postgres 17.6)
**Repo:** https://github.com/YuFuSi/StokAdres · branch `main`
**Supabase proje ref:** `ryuguxxnmccybquqigji` (region ap-northeast-1)

Önemli kavram: **ürünün "stok adedi" alanı yoktur.** Miktar yalnızca adres
kayıtlarındaki `carton_count` (koli) toplamından türetilir. Yani bu bir
koli/lokasyon takip sistemi, klasik adet bazlı stok sistemi değil.

**Ölçek:** ~95.000 ürün. Bu sayı mimariyi belirliyor — istemciye tüm tabloyu
çeken her kod yolu artık bir hatadır (bkz. Tuzaklar #3).

**Gerçek günlük akış:** Depo çalışanı Harun abiye liste getirir → fiş CABA'da
aranıp Excel alınır → **CABA Listesi** ekranına yapıştırılır → adresler ekranda
çıkar ve yazdırılır. Sayım sonrası kâğıda yazılan veriler Gemini ile Excel'e
çevrilip **İçe Aktar** ekranından yüklenir.

---

## Komutlar

```bash
npm run dev        # Vite + Electron (--dev, localhost:5173 yükler)
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run test:watch # vitest (izleme)
npm run build      # typecheck + vite build + tsc electron
npm start          # build + electron (production, file:// yükler)
npm run build:win  # build + electron-builder --win nsis → release/
```

---

## Mimari Haritası

```
electron/main.ts          BrowserWindow + 2 IPC handler (save-csv, save-file)
electron/preload.ts       contextBridge → window.electronAPI
src/App.tsx               Router YOK — state tabanlı ekran switch'i
src/layouts/AppLayout     Sidebar (10 link) + Ctrl+K komut paleti
src/lib/supabase.ts       createClient<Database> (tipli)
src/lib/pagination.ts     fetchAllRows() — PostgREST 1000 satır sınırını aşar
src/pages/                10 sayfa
src/services/             Veri erişim katmanı (UI supabase'i doğrudan import etmez)
src/services/*.test.ts    Vitest testleri
src/import/               ⚫ ÖLÜ modül (bkz. Tuzaklar #1)
src/data/localData.ts     addressRecordService singleton'ı burada
scripts/bulk-load-products.mjs  Toplu ürün yükleme (README yanında)
supabase/migrations/      13 dosya, hepsi canlıya uygulanmış
```

### Ekran durumları
| Ekran | `AppPage` | Durum |
|---|---|---|
| Stoklar | `stocks` | 🟢 **Sunucu tarafı** sayfalama + arama + filtre sayaçları |
| Ürün Detayı | `stocks` + seçim | 🟢 Tam CRUD |
| Adresler | `addresses` | 🟢 Tam CRUD |
| İşlem Geçmişi | `audit` | 🟢 Çalışıyor |
| **CABA Listesi** | `caba` | 🟢 **Yeni** — fiş yapıştır → adresleri bul (salt okuma) |
| **İçe Aktar** | `import` | 🟢 **Yeniden yazıldı** — önizleme + satır bazlı düzeltme + toplu yazma |
| Genel Bakış | `dashboard` | 🟡 `dashboard_summary` view'ından tek sorgu |
| Adres Bul | `find` | 🟡 Arama iyileşti ama **tüm ürünleri istemciye çekiyor** (bkz. Tuzak #4) |
| Dışa Aktar | `export` | 🟡 Aynı ölçek sorunu (Tuzak #4) |
| Çakışmalar | `conflicts` | 🟡 UI tam, ama **hiç veri almıyor** (Tuzak #2) |
| Ayarlar | `settings` | 🔴 Sadece tema butonu |

---

## ⚠️ TUZAKLAR — Bunları Bilmeden Kod Yazma

### 1. Ölü kod: `HomePage.tsx` ve `src/import/*`
`src/pages/HomePage.tsx` (776 satır) artık **App.tsx'ten import bile edilmiyor**
— tamamen yetim. Yalnızca ondan çağrılan `src/import/*`, `dataBackup.ts`,
`recentProducts.ts`, `ActionCard.tsx` de erişilemez.
**İstisna:** `productSearch.ts` canlı — `AppLayout` (Ctrl+K) ve `Finder` kullanıyor.

### 2. Conflict sistemi hâlâ beslenmiyor
`address_conflicts` tablosu, RPC'leri ve `ConflictsPage` tam çalışır durumda,
ama **conflict üreten hiçbir canlı kod yolu yok.** Yeni `operationImportApply.ts`
de conflict oluşturmuyor. Tek üretici erişilemez `src/import/importService.ts`.
Sonuç: Çakışmalar ekranı her zaman boş.

### 3. 95k ölçeği — istemciye tüm tabloyu çekme
`listProducts()` (`fetchAllRows` ile) ~95 HTTP isteği yapıp 95.000 satırı
belleğe alır. **Yeni kodda kullanma.** Bunun yerine:
- Liste + arama + sayfalama → `queryProducts()` / `search_products` RPC
- Filtre sayaçları → `getProductFilterCounts()` (`product_filter_counts` view)
- Dashboard metrikleri → `dashboard_summary` view
- Toplu kod/barkod eşleme → `productLookup.ts` (`in.(...)` ile 200'lük parçalar)

### 4. 🔴 `Finder` ve `ExportHub` hâlâ tüm tabloyu çekiyor
[OperationsPage.tsx](src/pages/OperationsPage.tsx) içindeki her iki bileşen de
`listProducts()` + `addressRecordService.list()` çağırıyor. 95k ölçekte açılış
çok yavaş ve bellek ağır. **Açık Sorun #1** — `productLookup` / `search_products`
üzerine taşınmalı.

### 5. 🔴 Türkçe locale — normalize ederken `tr-TR` KULLANMA
Veritabanı collation'ı `en_US.UTF-8`. Postgres `lower('IĞNE')` → `'iğne'`
(noktalı i). JavaScript `toLocaleLowerCase('tr-TR')` → `'ığne'` (noktasız).
Bu değer **hiçbir zaman eşleşmez ve hata da vermez** — sonuç sessizce
"bulunamadı" olur.
- **DB ile eşleştirme yapan normalize** (`stock_code_normalized`,
  `lower(trim(address))`, barkod) → düz `toLowerCase()`.
  Kanonik uygulama: [productLookup.ts](src/services/productLookup.ts)
  `normalizeStockCode` / `normalizeAddress`.
- **Yalnızca istemci içi görüntüleme/sıralama/filtreleme** → `tr-TR` uygun
  (`productSearch.ts`, tablo sıralamaları böyle).

### 6. `createProduct` gerçek transaction değil
Telafi (compensating) mantığı var: barkod yazımı patlarsa
`rollbackCreatedProduct()` ürünü siler. Silme de patlarsa barkodsuz yetim ürün
kalır ve konsola loglanır. Tek transaction isteniyorsa RPC gerekir.

### 7. `base: './'` zorunlu
[vite.config.ts](vite.config.ts) — kaldırılırsa production/paketlenmiş uygulama
beyaz ekran verir (`file://` + mutlak yol).

### 8. `dist-electron/` git'te takipli DEĞİL
Ama `package.json` `main` alanı oraya bakıyor. Build çıktısı, her build'de
yeniden üretiliyor.

### 9. `src/types/database.ts` otomatik üretilir
Şema değişince yenilenmeli: `generate_typescript_types` (Supabase MCP) veya
`supabase gen types typescript --project-id ryuguxxnmccybquqigji`.
Üreteç CHECK constraint'lerini ifade edemez (`conflict_type: string` gelir);
daraltma mapping fonksiyonlarında yapılır. Varsayılansız fonksiyon
parametrelerini de NOT NULL üretir — `conflictService`'te dar cast'ler bu yüzden.

---

## Canlı Database Şeması

Şema `supabase/migrations/` içinde **tam olarak** mevcut ve 13 migration'ın
tamamı canlıya uygulanmış (`schema_migrations` 13 satır, versiyonlar dosya
adlarıyla birebir eşleşiyor).

### Tablolar
Satır sayıları 2026-09-10 anlıkdır; yapı sabittir.

| Tablo | Satır | RLS | Not |
|---|---|---|---|
| `products` | **~94.894** | ✅ | `stock_code` UNIQUE (ham) · `stock_code_normalized` generated |
| `product_barcodes` | ~20 | ✅ | `barcode` UNIQUE (`lower(trim())`) |
| `address_records` | ~119 | ✅ | `carton_count >= 0` CHECK |
| `address_conflicts` | 0 | ✅ | SELECT-only, yazma RPC ile |
| `audit_logs` | ~1.8k+ | ✅ | SELECT-only, yazma trigger ile |

### View'ler ve arama fonksiyonu (2026-09-10, ölçek çalışması)
| Nesne | İşlevi |
|---|---|
| `products_with_metrics` | Ürün + adres/koli sayıları, `stock_code_normalized` — DB'de hesaplanır |
| `dashboard_summary` | Dashboard'un 4 metriği tek satırda |
| `product_filter_counts` | Filtre çiplerinin 3 sayısı tek satırda |
| `search_products(text,text,text,int,int)` | Sunucu tarafı arama (pg_trgm 1.6), toplam sayıyı da döndürür |

### Kritik index'ler
```sql
products_stock_code_unique                UNIQUE (stock_code)
product_barcodes_barcode_unique           UNIQUE (lower(trim(barcode)))
idx_address_records_unique_active_address UNIQUE (product_id, lower(trim(address))) WHERE is_active
```

### FK davranışları
```
address_records.product_id  → products(id) ON DELETE CASCADE   ⚠️
product_barcodes.product_id → products(id) ON DELETE CASCADE   ⚠️
address_conflicts.product_id / existing_record_id → ON DELETE SET NULL
audit_logs.product_id       → ON DELETE SET NULL
```
⚠️ `products` DELETE anon'a açık + CASCADE → **tek ürün silme, tüm adres ve
barkod kayıtlarını da siler.** Uygulama `deleteProduct` implement etmiyor ama
RLS policy açık.

### RLS özeti
- `products`, `product_barcodes`, `address_records` → anon'a **tam CRUD** (`using true`)
- `audit_logs`, `address_conflicts` → anon'a **sadece SELECT**

### Fonksiyon yetkileri
| Fonksiyon | anon EXECUTE |
|---|---|
| `clear_address_records` / `restore_address_records` | ❌ (Sprint 0.1'de revoke edildi) |
| `write_audit_log` | ❌ |
| `create_address_conflict` / `resolve_address_conflict` | ✅ (tasarım gereği) |
| `search_products` | ✅ (tasarım gereği) |
| trigger fonksiyonları (4 adet) | ✅ ⚠️ gereksiz yüzey |

### Trigger'lar
```
products            → products_audit_trigger, products_set_updated_at
address_records     → address_records_audit_trigger, address_records_set_updated_at
product_barcodes    → product_barcodes_audit_trigger
address_conflicts   → address_conflicts_audit_trigger
```

---

## Bilinen Açık Sorunlar (öncelik sırasıyla)

| # | Sev | Sorun |
|---|---|---|
| 1 | 🔴 | **`Finder` ve `ExportHub` 95k satırı istemciye çekiyor** (Tuzak #4) |
| 2 | 🔴 | **Auth yok** — anon key installer bundle'ında, anon tüm tablolara yazabiliyor |
| 3 | 🟠 | Conflict sistemi hiç tetiklenmiyor (Tuzak #2) |
| 4 | 🟠 | `createProduct` gerçek transaction değil (Tuzak #6) |
| 5 | 🟡 | Adresten ürün bulma (ters arama) yok; barkod okuyucu akışı yok |
| 6 | 🟡 | 14+ `as unknown as` cast — iç içe ilişki seçimlerinde nullable uyumsuzluğu |
| 7 | 🟡 | Trigger fonksiyonları anon'a RPC olarak açık (Supabase linter) |
| 8 | 🟡 | `set_updated_at` / `audit_operation_id` mutable search_path |
| 9 | 🟡 | CSP yok, installer imzasız, ikon yok |
| 10 | 🟢 | Ölü kod: `HomePage.tsx` + `src/import/*` + `dataBackup` + `recentProducts` + `ActionCard` |
| 11 | 🟢 | ESLint yok, CI yok (test altyapısı artık **var**: vitest, 21 test) |

---

## Çalışma Kuralları

- Mevcut mimariyi yeniden yazma; sprint kapsamı dışına çıkma.
- DB değişikliği **her zaman** migration üzerinden. `db push`/`db reset` yok.
- Canlı DB'yi elle değiştirme; migration yaz, kullanıcı uygulasın.
- Emin olmadığın şemayı tahmin etme — önce `execute_sql` ile teşhis et.
- Secret/API key asla commit etme. `.env` gitignore'da.
- Her değişiklikten sonra en azından `npm run typecheck` ve `npm test`.
- Yıkıcı RPC/fonksiyonları argümanla test etme.
- 95k ölçeği unutma: yeni sorgu yazarken önce "bu istemciye kaç satır çeker?"

---

# Çalışma Günlüğü

## 2026-09-08 — Sprint 0.1: Production Build + RPC Security
**Commit:** `c64030f`

- 🔴→✅ **Production beyaz ekran çözüldü.** Kök sebep: Vite `base` ayarsız →
  `/assets/...` mutlak yolu `file://` altında sürücü köküne çözülüyordu.
  `vite.config.ts` → `base: './'`. CDP ile paketlenmiş `StokAdres.exe`
  üzerinde doğrulandı.
- 🔴 **Yıkıcı RPC migration'ı yazıldı**; kullanıcı aynı gün manuel revoke etti.
- 🔴→✅ **Barkod schema drift teşhis edildi.** `products.barcode` yok (42703);
  repo'daki `audit_products_trigger` bu kolona bakıyordu → uygulansaydı ürün
  oluşturmayı tamamen kıracaktı.
- Environment fallback kaldırıldı; `dist-electron/` untrack edildi.
- Installer üretildi: `release/StokAdres Setup 1.0.0.exe` (116 MB).

**Keşif:** Canlı DB repository'den ileride; migration'lar canlıya bu haliyle
uygulanmamış.

## 2026-09-09 — Sprint 0.2: Live Schema Extraction
**Commit:** `3f9f9c0` + merge `328010d`

Supabase MCP bağlantısı açıldı → Sprint 0.1'de "BLOCKED" olan her şey çözüldü.

- ✅ Revoke doğrulandı (`{postgres=X, service_role=X}`).
- ✅ **Çekirdek şema repository'ye indirildi** (`20260904000000_create_core_schema`).
  Artık boş projede kurulabilir.
- ✅ **Kayıp trigger bulundu** (`audit_product_barcodes_trigger`), gövdesi
  canlıdan `pg_get_functiondef()` ile birebir alındı.
- ✅ Veri bütünlüğü taraması: sıfır bozukluk.
- ✅ **Migration dosya adları düzeltildi.** Üç dosya `20260905`, iki dosya
  `20260908` versiyonunu paylaşıyordu (`version` benzersiz olmalı) ve
  `_conflict_rpc` alfabetik olarak `_conflicts`'ten önce geliyordu → boş DB'de
  patlardı. Benzersiz + doğru sıralı versiyonlara taşındı.
- ✅ **Migration geçmişi kuruldu** (öncesinde `schema_migrations` tablosu bile
  yoktu). `20260905*` dosyaları **bilerek çalıştırılmadı**, baseline'landı:
  yeniden çalıştırılsalar yıkıcı RPC yetkilerini anon'a geri verir ve
  `audit_products_trigger`'ı bozuk haliyle kurarlardı.
- ✅ `xlsx` 0.18.5 → **0.20.3** (SheetJS CDN tarball). `npm audit`: 0 açık.
  Round-trip testi: Türkçe karakterler ve CSV yolu doğrulandı.
- ✅ `src/types/database.ts` üretildi, `createClient<Database>()` devreye alındı.
  İlk typecheck'te gerçek bir tip hatası yakaladı.
- **`queries.md` incelendi** (kullanıcının elle çalıştırdığı SQL geçmişi):
  barkod drift'inin kaynağı Query 13, Query 14 rollback olmuş, **veri kaybı yok**
  (`products.barcode` hiç dolu olmamış).
- **PR #1 ile merge:** `src/lib/pagination.ts` (`fetchAllRows`) geldi, sayfalama
  çözüldü. PR #1'in kendi core schema dosyası **silindi** — canlıyla uyuşmuyordu
  (eksik DELETE policy, eksik barkod UNIQUE index, farklı fonksiyon adı).

## 2026-09-10 — PR #2 pull edildi: *Scale to 95k products*
**Commit:** `2d3535e` (34 dosya, +3361/−179) · yerel commit yok, sadece pull.

Paralel bir oturumun çalışması. Doğrulananlar: `npm run typecheck` PASS,
`npm test` **21/21 PASS**, 13 migration'ın tamamı canlıda mevcut,
`products` **94.894 satır** (bulk load çalışmış).

**Gelen mimari değişiklik — veri katmanı sunucuya taşındı:**
- `products_with_metrics`, `dashboard_summary`, `product_filter_counts` view'leri
  ve `search_products()` fonksiyonu (pg_trgm 1.6) eklendi.
- `StocksPage` tamamen sunucu tarafı: `queryProducts()`, sayfalama, debounce'lu
  arama, `getProductFilterCounts()`.
- `dashboardService` tek sorguya indi (~27 MB indirme ortadan kalktı).

**Yeni ekranlar ve servisler:**
- `CabaLookupPage` + `cabaLookup.ts` — uygulamanın asıl günlük işi, salt okuma.
- `ImportPage` + `operationImportApply.ts` — import baştan yazıldı: önizleme,
  satır bazlı düzeltme, toplu yazma. Eski `OperationsPage.ImportHub` kaldırıldı;
  `OperationsPage` artık yalnızca `find` / `export` / `settings`.
- `productLookup.ts` — CABA ve import'un paylaştığı parçalı (200'lük chunk)
  eşleme katmanı.
- `scripts/bulk-load-products.mjs` + README.

**Test altyapısı geldi:** Vitest, `npm test` / `npm run test:watch`,
`productLookup.test.ts` + `operationImportService.test.ts`.

**Açık Sorun #4 (eski) büyük ölçüde kapandı:** `mapStockCodeError` artık
`createProduct` ve `updateProduct`'ta doğru yerde; orphan ürün için telafi
rollback'i eklendi.

**⚠️ Bu turda ortaya çıkan iki yeni durum:**
1. **Tuzak #5 güncellendi — Türkçe locale kuralı TERSİNE DÖNDÜ.** Önceki
   CLAUDE.md "yeni kodda `tr-TR` kullan" diyordu; DB ile eşleştirme yapan
   normalize işlemlerinde bu **yanlış** ve sessiz "bulunamadı" üretiyor.
   Kanonik kural artık Tuzak #5'te.
2. **Yeni Açık Sorun #1:** `Finder` ve `ExportHub` ölçek çalışmasının dışında
   kalmış; hâlâ `listProducts()` ile 95k satır çekiyorlar.

**Sonraki adım önerisi:** Açık Sorun #1 — `Finder` ve `ExportHub`'ı sunucu
tarafı arama/akışa taşımak. En görünür performans kazancı orada.
