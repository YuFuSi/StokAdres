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
**Supabase proje ref:** `zxdojwbrttdarcgytzsi` — **StokAdres-EU**, eu-central-1 (Frankfurt), 2026-09-11'den beri aktif
**Eski proje:** `ryuguxxnmccybquqigji` (StokAdres, Tokyo) — taşıma kaynağı, geri dönüş için dokunulmadan duruyor. Yeni migration'ları ona UYGULAMA.

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
electron/main.ts          BrowserWindow + 4 IPC (save-csv, save-file, save-backup, open-backup-folder)
electron/preload.ts       contextBridge → window.electronAPI
src/App.tsx               Router YOK — state tabanlı ekran switch'i
src/layouts/AppLayout     Sidebar (9 link) + Ctrl+K paleti (sunucu araması) + bağlantı göstergesi
src/lib/supabase.ts       createClient<Database> (tipli)
src/lib/pagination.ts     fetchAllRows() — PostgREST 1000 satır sınırını aşar
src/lib/addressFormat.ts  SAF · adres biçimi: parse, normalize (h21-1 → H21-01), rota sırası
src/lib/pickList.ts       SAF · CABA sonucu → koridor gruplu toplama listesi
src/lib/stockCodeVariants.ts  SAF · Gemini okuma hataları için stok kodu adayları
src/lib/rowNavigation.ts  Tablo satırlarında ↑/↓/Enter
src/lib/*.test.ts         Saf modül testleri (.env gerektirmez, Tuzak #11)
src/pages/                9 sayfa
src/services/             Veri erişim katmanı (UI supabase'i doğrudan import etmez)
src/services/backupService.ts  Tek tıkla tam yedek → Belgeler\StokAdres Yedekleri
src/services/*.test.ts    Vitest testleri
src/data/localData.ts     addressRecordService singleton'ı burada
scripts/bulk-load-products.mjs  Toplu ürün yükleme + yedekten kurtarma (README yanında)
supabase/migrations/      21 dosya — adları schema_migrations ile birebir (Tuzak #14)
.github/workflows/ci.yml  typecheck + test + build
```

**Servis katmanı sınırı korunmalı:** *UI hiçbir yerde `supabase`'i doğrudan
import etmez.* 95k'ya geçişi mümkün kılan şey buydu — `listProducts()`'ın içi
sunucu tarafına taşındığında ekranlar hiç değişmedi.

### Ekran durumları
| Ekran | `AppPage` | Durum |
|---|---|---|
| Stoklar | `stocks` | 🟢 **Sunucu tarafı** sayfalama + arama + filtre sayaçları |
| Ürün Detayı | `stocks` + seçim | 🟢 Tam CRUD |
| Adresler | `addresses` | 🟢 **Sunucu tarafı** arama + filtre + sıralama + sayfalama |
| İşlem Geçmişi | `audit` | 🟢 Çalışıyor |
| **CABA Listesi** | `caba` | 🟢 Fiş yapıştır → adresler **depo rotasına göre** (koridor → raf → kat), koridor gruplu, yazdırılabilir (salt okuma) |
| **İçe Aktar** | `import` | 🟢 Önizleme + satır içi düzeltme + toplu yazma · adres biçimi düzeltme · "bunu mu demek istediniz?" |
| Genel Bakış | `dashboard` | 🟢 `dashboard_summary` + sayım ilerlemesi (koridorlar, son 14 gün) + yedek hatırlatıcı |
| Adres Bul | `find` | 🟢 Sunucu tarafı arama; stok kodu / ad / barkod **ve adres** (ters arama) · son aramalar |
| Dışa Aktar | `export` | 🟢 Her küme yalnızca ihtiyacını çekiyor; ilerleme gösteriliyor |
| Ayarlar | `settings` | 🟢 Tema (3 durum) · bağlantı teşhisi · sürüm · **Yedek Al** |

---

## ⚠️ TUZAKLAR — Bunları Bilmeden Kod Yazma

### 1. Ölü kod temizlendi — geri getirme
Faz 3.1'de ~1.700 satır silindi: `HomePage.tsx`, `src/import/*`,
`conflictService.ts`, `ConflictsPage`, `dataBackup.ts`, `recentProducts.ts`,
`demoData.ts`, `types/conflict.ts`, `ActionCard.tsx`. Hiçbiri erişilebilir
değildi. Git geçmişinde duruyorlar; ihtiyaç olursa oradan bakılır.

`AddressRecordService.replaceAll` / `.clear` de silindi — yıkıcı RPC'leri
çağırıyorlardı, yetkileri Sprint 0.1'de geri alınmıştı.

Faz 10.2'de de silindi: `productSearch.ts` (istemci tarafı arama; Ctrl+K sunucuya
taşınınca son kullanıcısı gitti), `productListing.filterAndSortProducts`,
`addressRecordService.listProducts`. `tsconfig`'te artık `noUnusedLocals` ve
`noUnusedParameters` açık — kullanılmayan kod derlemeyi kırar.

### 2. Çakışma sistemi istemciden kaldırıldı (bilinçli karar)
`address_conflicts` **tablosu ve migration'ları DB'de duruyor** (0 satır), ama
istemci kodu yok. Gerekçe:
- 6+ aylık kullanımda hiç conflict kaydı üretilmedi; üreten kod yolu zaten
  erişilemezdi.
- Tek operatörlü bir uygulamada 500 satırlık bir yapıştırmanın çakışmalarını
  ikinci bir ekranda tek tek çözmek, kaçınılmak istenen Excel yavaşlığının
  aynısı olurdu. Karar yapıştırma anında veriliyor — `ImportPage`'deki koli
  çakışması çubuğu.
- "Ne değişti" izi `audit_logs`'ta eski/yeni değerle zaten duruyor.

**Yeniden ayrı bir çakışma ekranı ekleme.** İhtiyaç çıkarsa önizleme içinde
çöz. Tablo geri alınabilir olsun diye duruyor.

### 3. 95k ölçeği — istemciye tüm tabloyu çekme
`listProducts()` (`fetchAllRows` ile) ~95 HTTP isteği yapıp 95.000 satırı
belleğe alır. **Yeni kodda kullanma.** Bunun yerine:
- Liste + arama + sayfalama → `queryProducts()` / `search_products` RPC
- Filtre sayaçları → `getProductFilterCounts()` (`product_filter_counts` view)
- Dashboard metrikleri → `dashboard_summary` view
- Toplu kod/barkod eşleme → `productLookup.ts` (`in.(...)` ile 200'lük parçalar)

### 4. `listProducts()` yalnızca dışa aktarmada
`Finder` ve `ExportHub` düzeltildi; ikisi de artık gerektiği kadarını çekiyor.
`listProducts()` (94.900 satır ≈ 95 istek) **sadece** "Stoklar" dışa aktarımında
kalıyor — orada zaten hepsi gerekiyor ve ilerleme gösteriliyor.

`search_products` stok kodu, stok adı, barkod **ve aktif adres** arıyor
(20260910192933). Adres yazınca o raftaki ürünler dönüyor — ters arama ayrı bir
ekran değil, aynı kutunun içinde.

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
  (`recentSearches.ts`, tablo sıralamaları böyle).
- Adres biçimi (`addressFormat.ts`) de DB'ye yazılan değeri ürettiği için düz
  `toUpperCase()` kullanır; koridor harfinde `İ/ı/i → I` ayrıca çevrilir.

### 6. Yazma yollarında gerçek transaction yok — telafi deseni kullanılıyor
Bu ölçek ve tek kullanıcı için bilinçli tercih; RPC'ye taşımak gerekmiyor.
Mevcut telafiler:
- `createProduct`: barkod yazımı patlarsa `rollbackCreatedProduct()` ürünü siler.
- `replaceProductBarcodes`: eski barkodlar önce okunur, INSERT patlarsa geri
  yazılır (`restoreProductBarcodes`). Bu olmadan eski barkodlar kalıcı
  kaybolurdu.
- `AddressRecordService.create`: ürünü bu çağrı oluşturduysa
  (`findOrCreateProduct().wasCreated`) ve adres kaydı patlarsa ürün silinir.

**Yeni yazma yolu eklerken aynı deseni uygula.** Telafinin kendisi de
patlayabilir; o durumda konsola loglanır, çağrı bozulmaz.

⚠️ Telafiler `products` üzerinde DELETE yetkisine bağlı. Faz 3.2'deki politika
bunu **boş ürünlerle** (adresi ve barkodu olmayan) sınırlar — telafi çalışır,
zincirleme silme engellenir. Politikayı büsbütün kaldırma.

### 7. `base: './'` zorunlu
[vite.config.ts](vite.config.ts) — kaldırılırsa production/paketlenmiş uygulama
beyaz ekran verir (`file://` + mutlak yol).

### 8. Uygulama ikonu: `build/icon.ico` **üretilmiş** bir dosyadır
Kaynak `build/icon.png`. `.ico` gerekiyor çünkü NSIS kurulum sihirbazının
ikonları PNG kabul etmiyor ("invalid icon file" ile derleme durur).
İkon değişirse: `powershell -ExecutionPolicy Bypass -File scripts/generate-icon.ps1`
Script 16–256 arası 7 boyutu 32-bit BGRA DIB girdisi olarak yazar (PNG girdisi
değil — NSIS'in eski ikon okuyucusu için).

### 9. `dist-electron/` git'te takipli DEĞİL
Ama `package.json` `main` alanı oraya bakıyor. Build çıktısı, her build'de
yeniden üretiliyor.

### 10. CSS'te sabit hex yazma — token kullan
Koyu tema yalnızca `:root[data-theme='dark']` içindeki `--*` token'larını
değiştirir. Sayfa CSS'ine literal hex yazarsan koyu temada olduğu gibi kalır.
Faz 3.3'te `.address-cell { color:#273131 }` yüzünden ADRES kolonu **1.17:1**
kontrasttaydı (okunmuyordu).

Kullan: `--ink`, `--muted`, `--teal`, `--danger`, `--success`, `--warning`,
`--page`, `--surface`, `--surface-muted`, `--line`.
Yeni renk eklerken **koyu karşılığını da** `:root[data-theme='dark']`'a yaz.
İstisna: `@media print` blokları — kâğıt her zaman beyaz, orada siyah doğru.

`global.css` tek bir `:root` bloğu içerir. Eskiden üç rakip blok vardı; ikinci
bir tane ekleme.

### 11. `supabase.ts` modül yüklenirken hata fırlatır — testleri etkiler
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` yoksa `src/lib/supabase.ts`
**import anında** hata fırlatır (Sprint 0.2; sessizce yanlış çalışmasın diye
kasıtlı). Sonuç: `supabase.ts`'i dolaylı da olsa import eden her test dosyası,
`.env` olmayan ortamda hiç çalışamaz.

CI bu yüzden placeholder `VITE_SUPABASE_*` değerleri veriyor
([ci.yml](.github/workflows/ci.yml)). Yeni test yazarken saf fonksiyonları
Supabase import eden modüllerden ayrı tutmak daha temiz olur.

### 12. `src/types/database.ts` otomatik üretilir
Şema değişince yenilenmeli: `generate_typescript_types` (Supabase MCP) veya
`supabase gen types typescript --project-id zxdojwbrttdarcgytzsi`.
Üreteç CHECK constraint'lerini ifade edemez (`conflict_type: string` gelir);
daraltma mapping fonksiyonlarında yapılır. Varsayılansız fonksiyon
parametrelerini de NOT NULL üretir. `suggest_stock_codes` ile iki dashboard
view'ının tipleri (Faz 6/8) üreteç biçiminde elle eklendi; bir sonraki yeniden
üretimde aynı çıkmalı.

### 13. Adres biçimi: yazma yollarında `toStoredAddress()`
Depo adresi `<koridor harfi><2 haneli raf>-<2 haneli kat | DİBİ>` (F13-01).
Canlıda 2.818 adresin 2.790'ı bu biçimde. Biçim dışı 2 kayıt var (`H21-1`,
`H34-1`, elle girilmiş); **bilerek elle değiştirilmedi**, Adresler ekranından
düzeltilebilir.
- Adres yazan her yol (İçe Aktar, Adresler formu, Ürün Detayı formu) kanonik
  değeri yazar: [addressFormat.ts](src/lib/addressFormat.ts) `toStoredAddress`.
- **Biçim dışı adres engellenmez**, olduğu gibi yazılır ve uyarılır — depoda
  bilinmeyen gerçek bir adres tipi olabilir.
- İçe Aktar'da hücrede kullanıcının yazdığı durur; yazılacak değer
  `PreviewRow.writeAddress`'te. Normalize edilmiş değeri hücreye geri yazma:
  600 ms'lik yeniden kontrol, kullanıcı "H21-10" yazarken "H21-1"de durduğu an
  değeri "H21-01"e çevirip elinden alır.

### 14. MCP `apply_migration` kendi versiyonunu atar
Dosyayı önceden bir zaman damgasıyla adlandırıp MCP ile uygularsan
`schema_migrations`'taki versiyon farklı olur. Uyguladıktan sonra
`list_migrations` ile versiyonu al, dosyayı **o** adla yaz. Bu drift iki kez
yaşandı (PR #2 ve Faz 3–4'ün 4 migration'ı; `f394d39`'da düzeltildi).

### 15. `pg_trgm` parametresi fonksiyona SET edilemiyor (42501)
`create function ... set pg_trgm.similarity_threshold = 0.4` "permission denied
to set parameter" verir: parametre, pg_trgm o oturumda yüklenene kadar
tanımsız. Migration'ın başına `select public.show_limit();` koymak yeterli
(20260911081023). Eşik önemli: varsayılan 0,3 ile 7 kod 347 ms, 0,4 ile 5 kod
76 ms (GIN index 10 kat fazla aday döndürüyor).

---

## Canlı Database Şeması

Şema `supabase/migrations/` içinde **tam olarak** mevcut ve 21 migration'ın
tamamı canlıya (Frankfurt) uygulanmış (`schema_migrations` 21 satır, versiyonlar
dosya adlarıyla birebir — 2026-09-11 `list_migrations` ile doğrulandı). Tokyo'da
20 satır: son migration (`20260911102221`) yalnızca taşımanın ürettiği yetki
açığını kapatıyor, Tokyo'da zaten gerekmiyordu.

**Plan: Supabase FREE** (2026-09-11, `get_organization`). Otomatik yedek yok,
7 gün kullanılmayan proje durdurulur, veritabanı sınırı 500 MB. Toplam boyut
187 MB; bunun 89 MB'ı `audit_logs`.

### Tablolar
Satır sayıları 2026-09-11 anlıkdır; yapı sabittir.

| Tablo | Satır | RLS | Not |
|---|---|---|---|
| `products` | **94.900** | ✅ | `stock_code` UNIQUE (ham) · `stock_code_normalized` generated |
| `product_barcodes` | 101.987 | ✅ | `barcode` UNIQUE (`lower(trim())`) |
| `address_records` | 2.818 | ✅ | `carton_count >= 0` CHECK |
| `address_conflicts` | 0 | ✅ | SELECT-only, yazma RPC ile |
| `audit_logs` | ~200k | ✅ | SELECT-only, yazma trigger ile · DB'nin yarısı |

### View'ler ve fonksiyonlar
| Nesne | İşlevi |
|---|---|
| `products_with_metrics` | Ürün + adres/koli sayıları, `stock_code_normalized` — DB'de hesaplanır |
| `dashboard_summary` | Dashboard'un 4 metriği tek satırda |
| `product_filter_counts` | Filtre çiplerinin 3 sayısı tek satırda |
| `search_products(text,text,text,int,int)` | Sunucu tarafı arama (pg_trgm 1.6), toplam sayıyı da döndürür; stok kodu/ad/barkod/aktif adres |
| `address_record_counts` · `search_address_records(...)` | Adresler ekranının filtre çipleri ve sunucu tarafı listesi |
| `suggest_stock_codes(text[],int)` | İçe Aktar "bunu mu demek istediniz?" — trigram benzerliği, eşik 0,4 (Tuzak #15) |
| `address_aisle_summary` | Genel Bakış: koridor başına aktif konum/ürün/koli (yalnızca `A99-` biçimi) |
| `address_daily_activity` | Genel Bakış: gün başına eklenen adres, son 31 gün, Europe/Istanbul |

### Kritik index'ler
```sql
-- Benzersizlik
products_stock_code_unique                UNIQUE (stock_code)          -- ham, lower(trim()) DEĞİL
product_barcodes_barcode_unique           UNIQUE (lower(trim(barcode)))
idx_address_records_unique_active_address UNIQUE (product_id, lower(trim(address))) WHERE is_active

-- Arama (PR #2, pg_trgm 1.6)
idx_products_stock_code_trgm              GIN (stock_code gin_trgm_ops)
idx_products_stock_name_trgm              GIN (stock_name gin_trgm_ops)
idx_product_barcodes_barcode_trgm         GIN (barcode gin_trgm_ops)
idx_products_stock_code_normalized        btree (lower(trim(stock_code)))
-- address_records.address üzerinde GIN trigram (ters arama, 20260910192933)
```

### FK davranışları
```
address_records.product_id  → products(id) ON DELETE CASCADE   ⚠️
product_barcodes.product_id → products(id) ON DELETE CASCADE   ⚠️
address_conflicts.product_id / existing_record_id → ON DELETE SET NULL
audit_logs.product_id       → ON DELETE SET NULL
```
⚠️ CASCADE nedeniyle bir ürünü silmek adres ve barkod kayıtlarını da siler.
Faz 3.2 migration'ı `products` DELETE politikasını **yalnızca boş ürünlerle**
(adresi ve barkodu olmayan) sınırlar: telafi yolları çalışır, zincirleme silme
engellenir.

### RLS özeti
- `products` → anon'a SELECT/INSERT/UPDATE serbest; **DELETE yalnızca boş ürün** (3.2)
- `product_barcodes`, `address_records` → anon'a **tam CRUD** (`using true`)
- `audit_logs`, `address_conflicts` → anon'a **sadece SELECT**

### Fonksiyon yetkileri
| Fonksiyon | anon EXECUTE |
|---|---|
| `clear_address_records` / `restore_address_records` | ❌ (Sprint 0.1) |
| `write_audit_log` | ❌ |
| `create_address_conflict` / `resolve_address_conflict` | ❌ (Faz 3.2) |
| trigger fonksiyonları (4 adet) | ❌ (Faz 3.2) |
| `search_products` | ✅ SECURITY INVOKER, tasarım gereği |
| `search_address_records` · `suggest_stock_codes` | ✅ SECURITY INVOKER, salt okuma |
| `audit_operation_id` / `set_updated_at` | ✅ zararsız, `search_path` sabitlendi (3.2) |

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
| 2 | 🔴 | **Auth yok** — anon key installer bundle'ında, anon `products`/`address_records`/`product_barcodes`'a yazabiliyor. Tek kullanıcı/tek makine olduğu için bilinçli ertelendi; ikinci makine çıkarsa öne alınmalı |
| 3 | 🟢 | ESLint yok. Test (vitest) ve CI var |
| 4 | 🟡 | Barkod okuyucu akışı yok (kullanıcı şimdilik istemiyor — kâğıtla çalışılıyor) |
| 5 | 🟡 | `as unknown as` cast'leri — iç içe ilişki/view seçimlerinde nullable uyumsuzluğu |
| 6 | 🟡 | `pg_trgm` public şemada (Supabase linter). Taşımak 95k satırda GIN index'leri yeniden kurmayı gerektirir; bilinçli bırakıldı |
| 7 | 🟢 | Installer imzasız (ikon eklendi, `680c0fd`) |
| 8 | 🟡 | **Supabase FREE plan** — otomatik yedek yok, 7 günde durdurma. Faz 7'nin yedeği ve hatırlatıcısı riski azaltıyor, kaldırmıyor; kalıcı çözüm Pro ($25/ay), kullanıcının kararı |
| 9 | ✅ | ~~Tokyo bölgesi gecikmesi~~ — 2026-09-11 Frankfurt'a taşındı (arama 1.009 → 312 ms, yedek 219 → 64 sn) |

---

## Çalışma Kuralları

- **Mimari hakkında:** "mevcut mimariyi yeniden yazma" kuralı 1.677 satırlık
  bir uygulama için yazılmıştı ve o bağlamda doğruydu. 95.000 satırda gerekçesi
  değişti — veri erişim katmanı çekinmeden sunucu tarafına taşındı (PR #2).
  Bugünkü kural: **servis katmanı sınırını koru** (UI supabase'i doğrudan
  import etmez), servislerin *içini* ölçek gerektirdiğinde değiştir. Ekranları
  ve `App.tsx`'teki state switch'ini gereksiz yere yeniden yazma.
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

## 2026-09-10 — Faz 3: Hatalar ve cila
Branch `chore/phase-3-cleanup-and-hardening`. Plan başka bir makinedeki
oturumda yazılmıştı; Faz 1 ve 2 PR #2 ile girmişti, Faz 3 hiç başlamamıştı.

**3.1 — Ölü kod (~1.700 satır silindi).** Detay: Tuzak #1 ve #2.

**3.3 — Koyu tema.** Plandaki teşhis ("üç rakip `:root` bloğu") kök sebep
değildi; asıl sorun sayfa CSS'lerindeki sabit hex renklerdi. Çalışan uygulamada
CDP ile ölçüldü: `.address-cell` **1.17:1 → 13.66:1**. 34 sabit renk token'a
bağlandı, `--danger`/`--success`/`--warning` eklendi (hepsi iki temada da
≥4.5:1, ölçüldü). `@media print` blokları dokunulmadı. `:root` blokları teke
indirildi. Tema artık `localStorage`'da kalıcı — bu, hatayı maskeleyen şeydi.

**3.4 — Stoklar layout.** `.stocks-layout--list-only` ile media query kuralı
aynı özgüllükteydi ve media query sonra geldiği için kazanıyordu → 821–1050px
arası 320px hayalet kolon. Pencerenin `minWidth`'i 900, tam bandın içinde.

**3.5 — Uyuyan veri kaybı yolları.** Detay: Tuzak #6.

**3.6/3.7** — Çift CSV üreticisi birleştirildi; `save-file` IPC'sinde encoding
beyaz listesi.

**3.9 — Electron sertleştirme.** CSP (yalnızca üretim derlemesinde, Vite
plugin), `setWindowOpenHandler`, `will-navigate`, üretimde varsayılan menü
kaldırıldı. Paketlenmemiş üretim Electron'unda doğrulandı: konsol temiz, CSP
ihlali yok, Supabase ve Google Fonts geçiyor.

**3.10 — CI** eklendi: typecheck + test + build.

**3.2 — DB yüzey daraltma** migration'ı yazıldı
(`20260910200000_narrow_database_surface.sql`). ⚠️ **Plandaki bir iddia
yanlıştı:** "uygulama `deleteProduct` implement etmiyor → DELETE policy'sini
kaldırmanın maliyeti sıfır". `rollbackCreatedProduct` ürün siliyor; politikayı
düz kaldırmak telafi yollarını bozardı. Bunun yerine politika **boş ürünlerle**
sınırlandı. 13 advisor bulgusundan 12'si kapanır (`pg_trgm` bilerek bırakıldı).

**3.8 — Uygulama ikonu yapılmadı.** Marka varlığı üretmek benim işim değil;
kullanıcıdan 512×512 PNG veya `.ico` bekleniyor.

**3.11 — Bu dosya** Faz 3 gerçeğine göre güncellendi.

### Faz 3 kapanışı

- Branch `main`'e fast-forward ile alındı (`0e5b5ff`).
- **3.2 migration'ı canlıya uygulandı.** Doğrulandı: advisor bulguları
  **13 → 1** (kalan: bilerek bırakılan `pg_trgm`). Uçtan uca test (anon
  anahtarla, kendi test ürünü üzerinde, sonra temizlendi):
  - Audit trigger'lar EXECUTE geri alındıktan **sonra da çalışıyor** —
    `product-created` ve `address-created` yazıldı. PostgreSQL EXECUTE'u
    `CREATE TRIGGER` anında denetliyor, her ateşlemede değil.
  - Adresi olan ürünü silme **engellendi**; ürün ve adres ikisi de kaldı →
    CASCADE zincirleme silme kapandı.
  - Boş ürün **silinebildi** → `rollbackCreatedProduct` telafisi çalışıyor.
- **İlk CI çalışması düştü** ve sebebi Tuzak #10 oldu: `supabase.ts`'in modül
  yüklenirken fırlattığı hata, `.env`'siz CI'da test dosyasını hiç
  çalıştırmıyordu. Placeholder env değişkenleriyle çözüldü; `.env` geçici
  gizlenerek yerelde birebir yeniden üretilip doğrulandı. CI artık yeşil.
- **3.8 (ikon) yapılmadı** — kullanıcıdan 512×512 PNG / `.ico` bekleniyor.

## 2026-09-10 — Adres Bul, Adresler sayfalama ve UI düzeltmeleri

Kullanıcı gerçek kullanımdan iki sorun bildirdi; ikisi de doğrulandı ve
düzeltildi.

**Adres Bul takılıyordu.** Açılışta `listProducts()` + `addressRecordService
.list()` çağırıyordu → 94.900 üründe ~95 istek, ~33 MB. Ekran "Stoklar
yükleniyor..." yazısında kalıyordu. Artık açılışta hiç veri çekmiyor (731 ms),
arama sunucuda (`search_products`, 250 ms debounce), adresler yalnızca görünen
20 sonuç için. Ölçüm: arama 0,6–1,6 sn + adresler ~0,3 sn.
**Sürenin çoğu ağ gecikmesi** — proje `ap-northeast-1` (Tokyo), her istek
~300 ms taban maliyet ödüyor. Bölge değişimi ayrı bir karar.

**Adresler sayfalandı.** 2.801 kayıt alt alta DOM'a basılıyordu. Artık
50'şerli, "1-50 / 2801 kayıt" + Önceki/Sonraki. Filtre/sıralama/arama istemcide
ve anlık kaldı; yalnızca çizim sayfalı.

**"Adresi yok" filtresi** (migration `20260910213000`): `product_filter_counts`
view'ine `no_address` kolonu, `search_products`'a `'no-address'` dalı.
93.033 ürün — yapılacak işin listesi. Canlıda doğrulandı: filtre açıkken
görünen satırların **hepsinin** adres kolonu "Adres yok".

**Genel Bakış metrikleri tıklanabilir.** "Toplam stok" ve "Adresi olmayan"
gerçek `<button>` (klavyeyle odaklanılabilir, ok işareti), ilgili filtre
önceden seçili olarak Stoklar'a götürüyor. "Toplam koli" ve "Adresli stok"
düz kutu kaldı — tek bir filtreye karşılık gelmiyorlar, tıklanacakmış gibi
görünüp hiçbir şey yapmamaları daha kötü olurdu.

**Kenar çubuğundaki bağlantı göstergesi gerçek oldu.** Eskiden koşulsuz
"Sistem çevrimiçi" yazıyordu. Artık `checkConnection()` ile 60 sn'de bir ve
pencere odağa döndüğünde denetleniyor. İlk sürümde çevrimdışı tespiti 10 sn
sürüyordu (fetch hatası supabase-js katmanlarından geçene kadar); 4 sn'lik
`AbortController` zaman aşımı eklendi. Ölçüldü: **çevrimdışı 5,1 sn, geri
dönüş 523 ms.**

**Zaten düzelmiş çıkanlar:** Genel Bakış'taki "Son Eklenen Adresler" başlığı
PR #2'de düzeltilmiş (eskiden yanlışlıkla "Stoklar" diyordu).

## 2026-09-10 — Ters arama ve Dışa Aktar ölçeklendirmesi

**Adresten ürüne ters arama** (migration `20260910223000`).
`search_products`'ın `matched` CTE'sine üçüncü bir union kolu: aktif adres
kayıtlarında `ilike` eşleşmesi. `address_records.address` üzerine GIN trigram
index eklendi (mevcut btree `ilike '%...%'` için işe yaramıyordu).
Ters arama ayrı bir ekran DEĞİL — aynı arama kutusunda. Kullanıcı ne yazdığını
düşünmek zorunda kalmıyor: stok kodu, ad, barkod veya adres.
Doğrulandı: `G27-04` → 2 ürün (gerçek sayı 2); `G27` → 16 (15 adres eşleşmesi
+ 1 stok adında `G2718` geçen ürün — union'ın doğru davranışı).

**Dışa Aktar artık yalnızca ihtiyacını çekiyor.** Eskiden hangi küme seçilirse
seçilsin `listProducts()` + tüm adres kayıtları alınıyordu.

| Veri kümesi | Önce | Sonra |
|---|---|---|
| Özet | ~98 istek | **4** (`address_records`×3 + `product_filter_counts`) |
| Stok + Adres | ~98 istek | **13** (`address_records`×3 + `product_barcodes`×10) |
| Adresler | ~98 istek | 3 |
| Stoklar | ~95 istek | ~95 (kaçınılmaz) + **ilerleme göstergesi** |

Bunu mümkün kılan değişiklikler:
- `xlsxExport.exportWorkbook(sheets, name)` — artık hazır satır kümeleri
  alıyor; hangi verinin gerektiğine kendi karar vermiyor.
- `summaryRows(records, { totalProducts })` — ürün sayısı dizi uzunluğundan
  değil `product_filter_counts`'tan.
- `stockAddressRows(records, barcodesByProductId)` — 94.900 ürün yerine
  yalnızca adres kaydı olan ~1.900 ürünün barkodu.
- `productLookup.findBarcodesByProductId()` — AddressesPage'deki yerel
  kopyadan servise taşındı; o sayfanın doğrudan `supabase` import'u da kalktı.
- `fetchAllRows(..., onProgress)` — "12.000 stok alındı…" gösterebilmek için.

**Yan etkiler:** `csvExport`'taki adres-özel üreticiler
(`createAddressRecordsCsv`, `exportAddressRecordsCsv`, `CSV_EXPORT_HEADERS`)
silindi; kaydetme zinciri genel amaçlı `saveCsvFile(csv, name)` oldu. Bunlar
CSV fallback'inin seçilen veri kümesini yok saymasının kaynağıydı — Electron
dışında her zaman adres kayıtları yazılıyordu.

## 2026-09-10 — Faz 4.1: Arayüz tutarlılığı (1. tur)

Kullanıcı: *"genel olarak böyle tam oturmuş değil, profesyonel bir havası yok."*
Bu tahminle çözülecek bir şey değildi — uygulama `--remote-debugging-port` ile
açılıp 1400×900'de 9 ekranın görüntüsü alındı ve şikâyet somut kusurlara
ayrıştırıldı. Bu tur yalnızca **tartışmasız yanlış** olanları kapsıyor; yoğunluk
ve hiyerarşi 2. tura bırakıldı.

**1. Sayfa adı ekranda 3–4 kez tekrarlanıyordu.** Kenar çubuğu + üst bardaki
sabit "StokAdres / Operasyon" + üst bardaki sayfa adı + eyebrow + `<h1>`.
Üst bar artık tek satır ve **grup gerçek gruptan** geliyor (Ayarlar'da bile
"Operasyon" yazıyordu). Sayfa eyebrow'ları kaldırıldı.
İstisna: `ProductDetailPage`'teki "STOK KODU" eyebrow'u gerçek bir etiket,
altındaki değeri adlandırıyor — duruyor.

**2. Sayılar iki farklı dildeydi.** Genel Bakış `94.900`, Stoklar `94900`,
Adresler `2818`. Tek otorite: [src/lib/format.ts](src/lib/format.ts)
`formatNumber()`. Yeni bir sayı ekrana basılacaksa buradan geçsin.

**3. Adres Bul'daki "çift çerçeve" — teşhis ilk tahminden farklı çıktı.**
İlk varsayım sarmalayıcının (`.finder-hero`) kendi çizgisiydi; onu kaldırmak
sorunu ÇÖZMEDİ. Computed style ölçümü gerçek sebebi verdi: global
`input:focus-visible` kuralı, sarmalayıcı zaten `:focus-within` halkası
çizerken input'a ayrıca `outline: 2.67px` / `offset: 2px` uyguluyordu — iç içe
iki halka. Outline yalnızca sarmalayıcısında **görünür** `:focus-within`
halkası olan dört alanda kapatıldı; odak her yerde görünür kaldı.

**4. Araç çubukları köşesiz birer kutuydu.** `.stocks-toolbar` /
`.addresses-toolbar` computed: `borderLeftWidth = borderRightWidth = 1px`.
Temel kural `border: 1px solid` veriyordu, sonraki katmanlar yalnızca
`border-top`/`border-bottom`'ı yeniden tanımladığı için yanlar hiç
sıfırlanmamıştı. "Üstten ve alttan çizgi" diye tasarlanan şerit kutu olarak
çiziliyordu.

**5. Stoklar'daki "Durum" sütunu sıfır bilgi taşıyordu.** Canlıda doğrulandı:
`aktif = 94.900, pasif = 0`. Sütun kaldırıldı (veri duruyor; dışa aktarmada ve
ürün detayında kullanılmaya devam ediyor). Adresler'deki Durum sütunu KALDI —
orada `is_active` kullanıcının açıp kapattığı gerçek bir alan.

**6. Satır sonu aksiyonu tekleştirildi.** Stoklar'da "Görüntüle" yazan bir
bağlantı, Adresler'de var olmayan bir menüyü ima eden `⋯` vardı; ikisi de aynı
işi yapıyordu. Tek bir sessiz `ChevronRight` (`.row-open`). `tabIndex={-1}`:
satırın kendisi zaten tıklanabilir, sekme sırasına 50 satır boyunca ikinci bir
durak eklemek gezinmeyi bozuyordu.

**7. Boş hücreler.** "Adres yok" + "0" ikilisi 50 satır boyunca tekrarlanıyordu;
artık tek tire (`.cell-empty`). Dolu satırlar öne çıkıyor.

**8. Filtre çipleri denetim gibi görünmüyordu.** Yalnızca seçili çipin kutusu
vardı; "Adresi yok 93.027" düz yazı gibi duruyordu. Adresler'deki segment
denetiminin aynısı Stoklar'a da uygulandı.

**9. Ayarlar ekranı boştu** — başlık + tek bir "Koyu tema" butonu, açıklamaya
yapışık. Artık üç satır: tema seçimi (**üç durumlu** — `ThemeProvider`
`'system'` tercihini zaten destekliyordu ama arayüzde erişilebilir değildi),
veritabanı bağlantı durumu ve sürüm.
Sürüm `vite.config.ts` `define` ile **package.json'dan** geliyor
(`__APP_VERSION__`); elle yazılan bir sabit kaçınılmaz olarak saparadı.
`vitest.config.ts` `vite.config.ts`'i devralmaz — orada da bir yer tutucu
tanımlandı, yoksa bir bileşeni içe aktaran ilk test düşerdi.

**10. Küçük tutarsızlıklar.** Kenar çubuğu "CABA Listesi" derken başlık "CABA
ile Adres Bul" diyordu → eşitlendi. Genel Bakış'taki "Canlı veri" rozeti kenar
çubuğundaki bağlantı göstergesini tekrarlıyordu → kaldırıldı. Adres Bul'un boş
durumu 220px'lik dolu beyaz bir kutuydu ve içindeki cümle üstündeki açıklamanın
neredeyse aynısıydı → 132px, saydam, metinler ayrıştırıldı.

**Ölü CSS temizlendi:** `.stock-status`, `.table-action`, `.address-row-action`,
`.application-bar__eyebrow`.

### ⚠️ Yeni tuzak: global.css sayfa CSS'lerini eziyor
`.finder-hero` düzeltmesi `OperationsPage.css`'e yazıldığında **etkisiz kaldı**
(computed hâlâ `padding: 18px 0 22px`). Ölçüldü: `global.css` paket içinde
sayfa CSS'lerinden **sonra** geliyor, dolayısıyla aynı özgüllükteki kuralı
eziyor. Bir sayfa kuralı global.css'in "V4"/"V5" bloklarında da tanımlıysa
düzeltme global.css'in sonuna yazılmalı. Bu turdaki düzeltmeler orada, açık
başlıklı bir blokta toplandı.

**Doğrulama:** typecheck PASS · 21/21 test PASS · build PASS · 9 ekranda konsol
temiz (hata ve uyarı yok) · her düzeltme computed style ile teyit edildi.

**2. tur (bekliyor):** satır yoğunluğu (Stoklar 50,7px / Adresler 62px — iki
tablo farklı), boş ekranlardaki dikey boşluk yönetimi, Genel Bakış'taki
"Son İşlemler" panelinin bitmemiş görünümü, arama kutusu/filtre oranı.

## 2026-09-10 — Faz 4.2: Yoğunluk ve hiyerarşi (2. tur)

1. turda "tartışmasız yanlış" olanlar düzeltilmişti; bu tur ekranların birbirine
benzemesiyle ilgili. Yine tahminle değil ölçümle: her değişiklik `--remote-debugging-port`
ile açık uygulamada computed style ve WCAG kontrast hesabıyla doğrulandı.

**1. Üç tablo, üç farklı dil vardı.** Ölçüm: Stoklar satırı 50,7px / 13px yazı
yok (12px), Adresler 62px / 13px, Genel Bakış 42,7px / 12px. Adresler'de başlık
şeridi ve odak çizgisi varken Stoklar'da yoktu. Üçü de ortak bir kurala bağlandı:
54px satır, 13px gövde, 43px başlık şeridi, aynı hover (`inset 3px 0 0 var(--teal)`),
stok kodu her yerde 12px monospace.
**Yazı boyutu KÜÇÜLTÜLMEDİ** — ekrana daha çok satır sığsın diye 13px'in altına
inmek bu kullanıcı için yanlış olurdu. Stoklar 9, Adresler 8 satır gösteriyor.

**2. `.dashboard-quick > div` yanlış elemanı da seçiyordu.** Ölçüm:
`.section-heading` display=grid, dört sütun. "Hızlı İşlemler" başlığının yanındaki
ayırıcı çizgi ikinci sütunda kesiliyor, üstüne bir de kenarlık biniyordu. Kural
artık yalnızca `.dashboard-quick__actions`'a bakıyor.

**3. Genel Bakış'taki "Son İşlemler" paneli kaldırıldı.** İki cümleden ibaretti,
yarım ekran boşluk kaplıyordu ve söylediği şeyi (son hareketler) hemen altındaki
tablo zaten gösteriyordu. Taşıdığı tek gerçek sayı — aktif kayıt adedi — o
tablonun başlığına taşındı. "Hızlı İşlemler" tam genişlikte dört sütun oldu.

**4. Stoklar araç çubuğu Adresler'inkiyle eşitlendi.** Flex + `flex:1` yüzünden
arama kutusu şeridin neredeyse tamamını yiyordu; artık ikisi de
`minmax(360px,1fr) auto auto`.

**5. Dışa Aktar'ın adım numaraları bozuktu** — ekranda `01 → (yok) → 03`
görünüyordu. Numara CSS'teki `:nth-child` sayacından geliyordu; araya koşullu
bir ipucu paragrafı girdiğinde "Format" üçüncü çocuk oluyor ve numarasız
kalıyordu. Artık `data-step` ile veriden geliyor.
⚠️ İlk denemem işe yaramadı: eski `:nth-child(n):before` kurallarını
`content:none` ile susturmak, ozgullukleri daha yüksek olduğu için bu kez
**01'i** yok etti. Doğrusu aynı seçicilere aynı `attr(data-step)` değerini
vermek. Ekranda doğrulandı.

**6. `.export-hint`in hiç CSS kuralı yoktu** — tarayıcı varsayılanıyla 16px koyu
metin olarak çiziliyor ve ekrandaki en dikkat çekici satır oluyordu.

### 🔴 Koyu temada okunamayan rozetler (Tuzak #10'un aynısı, yeni yerde)

**Ölçüm: `.address-status--active` koyu temada 1,59:1.** Faz 3.3'teki
`.address-cell` (1,17:1) hatasının birebir aynısı: metin `var(--success)` ile
temaya göre değişiyor, zemin `#e4f3ec` sabit kalıyor → koyu temada açık yeşil
üzerine açık yeşil.

Tarama yapıldı, **12 rozet kuralı** aynı desende bulundu (`address-status`,
`import-status`, `import-count` aileleri). Üç yeni token eklendi —
`--success-soft`, `--warning-soft`, `--danger-soft` — ve hepsi bunlara bağlandı.
Nötr rozet ayrı token istemiyor: `--surface-muted` zaten iki temada da `--muted`
ile ≥4,5:1 (açık 4,60 · koyu 6,37).

Doğrulandı: `.address-status--active` **açık 5,58:1 · koyu 6,81:1**.

**Üst bar zemini de sabit yazılmıştı** (`rgba(255,255,255,.72)`): koyu bir
uygulamanın tepesinde açık gri bir şerit kalıyor, içindeki breadcrumb neredeyse
okunmuyordu. Token'a bağlandı.

**1. turdan bir düzeltme geri alındı:** `.cell-empty` opaklığı .45'ti; ölçülünce
açık temada **1,84:1** çıktı — "yok" bilgisini taşıyan bir işaret için fazla
soluk. .80'e çıkarıldı (açık 3,31:1 · koyu 4,38:1); dolu hücreler 4,89:1 ile
yine öne çıkıyor. `.row-open` chevron'u da .45 → .65.

### Yanıldığım bir nokta
Ekran görüntülerinde Genel Bakış'ın stok adı sütununu "palete uymayan kahverengi
bir ton" diye not etmiştim. Ölçüm bunu doğrulamadı: o sütun da komşusu da
`rgb(105,115,114)`. Ekran görüntüsündeki alt piksel yumuşatma artefaktıymış.

**Doğrulama:** typecheck PASS · 21/21 test PASS · build PASS · 9 ekranda konsol
temiz · açık ve koyu temada ayrı ayrı görüntü alındı · kontrastlar WCAG göreli
parlaklıkla hesaplandı.

**Kalan (istenirse):** Adres Bul / Ayarlar / Dışa Aktar ekranlarının alt yarısı
boş — dürüst bir içerik olmadan doldurmanın anlamı yok, bilerek bırakıldı.
Tablo satırları hâlâ klavyeyle gezilemiyor (`<tr onClick>`).
*(İkisi de 2026-09-11'de kapandı: Adres Bul ve Ayarlar gerçek içerikle doldu,
satırlar ↑/↓/Enter ile geziliyor. Dışa Aktar bilerek aynı kaldı.)*

## 2026-09-11 — Faz 5–8 ve temizlik (10.1–10.2)
Branch `feat/faz-5-10`. Kullanıcı sordu: *"daha iyi görünmesi, daha işlevsel
olması için ne yapabiliriz?"* Dört önceliğin hepsi seçildi; üstüne ölü kod
temizliği ve en son .exe. Kararlar: CABA çıktısı **adrese göre**; sunucu
**Frankfurt'a taşınacak** (Faz 9, bekliyor).

**Planı belirleyen, canlıdan doğrulanan bulgular:**
- Ctrl+K paleti açılışta hâlâ `listProducts()` + tüm adresleri çekiyordu (~95 istek).
- Adresler çok düzenli: F, G, H, I, J, K, N, O koridorları; raf 01–37; kat 01–04 + DİBİ.
- Supabase planı FREE (bkz. Açık Sorun #8).

### Faz 5 — Günlük iş (`60a1c86`)
- Ctrl+K sunucu aramasına taşındı. Ölçüldü: açılış **0 istek**, yazınca 2.
- CABA listesi rota sırasında ve koridor gruplu; çok konumlu ürün her konumda
  ayrı satır ("15 konumda"). Kâğıtta işaretleme kutusu, `@page` ile "Sayfa X / Y".
  Gerçek kodlarla doğrulandı: F14-DİBİ → F15-02 → G27-04 … O37-03, 6 koridor.
- Ctrl+Enter (CABA, İçe Aktar) · Ctrl+P (CABA sonucu; üretimde menü kaldırıldığı
  için Electron bu kısayolu kendiliğinden yakalamıyor).
- Stoklar ve Adresler: ↑/↓/Enter (`rowNavigationProps`).
- CABA CSS'indeki 2 sabit hex token'a bağlandı.

### Faz 6 — Hataları yakala (`60a1c86`)
- Adres biçimi (Tuzak #13). Önizlemede doğrulandı: `h21-1` → H21-01,
  `f14 dibi` → F14-DİBİ, `rampa önü` uyarılı ama engellenmemiş.
- "Bunu mu demek istediniz?": önce deterministik varyantlar
  (`stockCodeVariants.ts`), bulunamazsa `suggest_stock_codes`. Doğrulandı:
  `TEKSI0465` → tek kesin öneri TEKS10465; "Önerileri uygula" sonrası satır
  "Yazılacak" oldu. `ZÜCC8619` → 3 benzer öneri. Öneriler asla kendiliğinden
  yazılmıyor.
- İlk migration denemesi 42501 ile reddedildi (Tuzak #15); hiçbir şey uygulanmadı.

### Faz 7 — Veriyi güvenceye al (`3edd6d3`)
- Ayarlar > **Yedek Al** → `Belgeler\StokAdres Yedekleri\StokAdres_yedek_<tarih>.xlsx`.
  Yeni IPC `save-backup` (dosya adı main process'te regex ile denetleniyor) ve
  `open-backup-folder`. IPC taklidiyle tarayıcıda ölçüldü: 94.900 / 101.987 /
  2.818 satır DB ile birebir, **219 sn** (Tokyo), 32,9 MB. Gerçek Electron IPC'si
  exe smoke testinde (10.3) doğrulanacak.
- Genel Bakış hatırlatıcısı (7 gün). Kenar çubuğu artık "İnternet yok" ile
  "Veritabanına ulaşılamıyor"u ayırıyor (ikincisinde durdurulmuş proje ipucu).
- Kurtarma prosedürü `scripts/README.md`'de; tatbikatla denenmedi, orada da yazıyor.

### Faz 8 — Görünüm (`3edd6d3`)
- Genel Bakış: sayım ilerlemesi (1.873 / 94.900 · %2), koridor çubukları, son
  14 gün. View'ler 20260911081956; toplamlar SQL ile doğrulandı (2.818).
- Adres Bul boş ekranında son aramalar.
- **Ölçüm:** `--muted` açık temada sayfa zemininde 4,48:1'di → `#646e6d`, 4,81.
  Yeni renk çiftlerinin hepsi iki temada da ≥4,5.
- **Plandan sapmalar:** Koridor çubuğuna tıklayıp arama eklenmedi — ters arama
  `ilike '%F%'` olduğu için "F" stok adlarında da eşleşir; tıklanabilir görünüp
  yanlış sonuç vermek kötü olurdu. CABA ekranına yapışkan koridor başlığı da
  eklenmedi (`.caba-table { overflow: hidden }` sticky'yi bozuyor).

### Faz 10.1–10.2 — Temizlik
- 4 migration dosya adı canlı versiyonlarla eşleştirildi (`f394d39`).
- Silinenler Tuzak #1'de. `tsconfig`'e `noUnusedLocals` / `noUnusedParameters`.
- 🔴→✅ **Gerçek hata bulundu:** Adresler > Düzenle, ürün seçici boş ve kilitli
  açılıyor, Kaydet "Ürün ... girin" doğrulamasına takılıyordu — Adresler
  ekranından düzenleme hiç çalışmıyordu. Sebep: iki yol da okunmayan bir
  `selectedProductId` yazıyordu. "Adres Ekle" de seçili kaydın ürünüyle
  başlamıyordu. İkisi düzeltildi; tarayıcıda kayıt yazmadan doğrulandı.
- `package-lock.json`'daki yerel fark yalnızca npm sürüm farkından gelen `peer`
  işaretleriydi; geri alındı.

**Doğrulama:** typecheck (noUnused dahil) PASS · 52 test PASS · build PASS.

### Güvenlik gerilemesi (20260911085611)
`get_advisors` taşıma öncesi taramada **2 × ERROR security_definer_view** buldu:
`product_filter_counts` ve `address_record_counts`, Faz 3–4 migration'larında
`security_invoker` olmadan yeniden kurulmuştu (Faz 3.2'de bulgular 13 → 1'e
inmişti). anon SELECT politikaları `using (true)` olduğu için davranış
değişmeden `security_invoker = true` yapıldı. Doğrulandı: advisor 3 → 1
(yalnızca bilerek bırakılan `pg_trgm`), uygulamadaki sayaçlar aynı
(94.900 / 93.027 / 1.362 / 511 · 2.818).
**Yeni view yazarken `with (security_invoker = true)` unutma** — `create or
replace view` bu seçeneği korumaz, yeniden belirtmek gerekir.

### Faz 9 — Frankfurt'a taşıma ✅
Yeni proje **StokAdres-EU** (`zxdojwbrttdarcgytzsi`, eu-central-1, FREE, 0 $/ay).
Tokyo (`ryuguxxnmccybquqigji`) **dokunulmadan duruyor** — geri dönüş `.env`'deki
yorum satırlarıyla; en az 2 hafta silinmemeli, silme kararı kullanıcının.

**Nasıl yapıldı** (şifreler hiçbir aşamada Claude'a geçmedi):
1. İlk `create_project` "ücretsiz aktif proje sınırı (2)" ile reddedildi;
   kullanıcı başka bir organizasyondaki projesini duraklattı.
2. Kullanıcı `winget install PostgreSQL.PostgreSQL.17` ile yalnızca komut satırı
   araçlarını kurdu (sunucu bileşeni kapalı).
3. Doğrudan DB adresleri **yalnızca IPv6**, bu bilgisayarda IPv6 yok → Session
   pooler: `aws-0-<bölge>.pooler.supabase.com:5432`, kullanıcı
   `postgres.<ref>`. Doğru havuz (`aws-0` mı `aws-1` mi) şifresiz `psql -w`
   yoklamasıyla bulundu: yanlış havuz "tenant not found", doğrusu
   "no password supplied" döner.
4. Kullanıcı kendi terminalinde `pg_dump --schema public --schema
   supabase_migrations --no-owner` (Masaüstü\StokAdres-tasima\ script'leri).
5. Kopya Supabase'e olduğu gibi yüklenemez; 4 yama: `CREATE SCHEMA public` →
   `IF NOT EXISTS`, `COMMENT ON SCHEMA public` silindi, 12 × `ALTER DEFAULT
   PRIVILEGES FOR ROLE supabase_admin` silindi, `pg_trgm` + `show_limit()`
   eklendi (Tuzak #15). Sona `ANALYZE`. Yükleme `--single-transaction`,
   `ON_ERROR_STOP` — ilk deneme yanlış şifreyle hiçbir şey yazmadan düştü.

**Doğrulama:**
- Beş tablonun satır **içerik** özetleri (md5) iki projede birebir; Türkçe
  karakter/kodlama bozulması yok.
- Tablo, view, index, politika, tetikleyici, kısıt ve tablo yetkisi parmak
  izleri birebir.
- 🔴→✅ **Taşımanın kendisi bir güvenlik açığı üretti:** yeni projede 9 SECURITY
  DEFINER fonksiyon (yıkıcı `clear_address_records`/`restore_address_records`
  dahil) anon tarafından çağrılabilir durumdaydı. Sebep: Supabase'in varsayılan
  yetkileri fonksiyon oluşturulurken anon'a EXECUTE veriyor, pg_dump ise ACL'i
  PostgreSQL'in kendi varsayılanına göre yazdığı için geri almıyor.
  `20260911102221_revoke_definer_function_grants_after_move` ile kapatıldı
  (Tokyo'daki durumla aynı; EXECUTE yetki listesi özeti birebir, advisor yalnızca
  `pg_trgm`). **Bir sonraki taşımada bunu ilk kontrol et.**
- 7 eski fonksiyonun tanım özeti farklı çıktı; `\r` çıkarılınca birebir aynı
  (Tokyo'dakiler Windows'tan `\r\n` ile girilmişti). Davranış farkı yok.

**Ölçüm (aynı 6 Adres Bul sorgusu, medyan):**

| | Tokyo | Frankfurt |
|---|---|---|
| `search_products` | 1.009 ms | **312 ms** |
| Adres sorgusu | 417 ms | **170 ms** |
| Ekrana gelme | ~1,7 sn | **0,93 sn** |
| Tam yedek | 219 sn | **64 sn** |

**Bekleyen:** 10.3 (sürüm 1.1.0 + exe smoke testi).
