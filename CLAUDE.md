# StokAdres — Proje Hafızası

Bu dosya her oturumun başında otomatik yüklenir. Amacı: projeyi her seferinde
baştan analiz etmeye gerek kalmaması. **Her çalışma gününün sonunda alttaki
"Çalışma Günlüğü" bölümüne özet eklenir.**

---

## Proje Nedir

Depo stok ve fiziksel adresleme yönetimi için **yerel Electron masaüstü
uygulaması**. Kullanıcı: Harun abi (depo operasyonu). Arayüz tamamen Türkçe.

**Stack:** Electron 44 + React 19 + TypeScript 7 + Vite 8 + Supabase (Postgres 17.6)
**Repo:** https://github.com/YuFuSi/StokAdres · branch `main`
**Supabase proje ref:** `ryuguxxnmccybquqigji` (region ap-northeast-1)

Önemli kavram: **ürünün "stok adedi" alanı yoktur.** Miktar yalnızca adres
kayıtlarındaki `carton_count` (koli) toplamından türetilir. Yani bu bir
koli/lokasyon takip sistemi, klasik adet bazlı stok sistemi değil.

---

## Komutlar

```bash
npm run dev        # Vite + Electron (--dev, localhost:5173 yükler)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build + tsc electron
npm start          # build + electron (production, file:// yükler)
npm run build:win  # build + electron-builder --win nsis → release/
```

---

## Mimari Haritası

```
electron/main.ts       BrowserWindow + 2 IPC handler (save-csv, save-file)
electron/preload.ts    contextBridge → window.electronAPI
src/App.tsx            Router YOK — state tabanlı ekran switch'i
src/layouts/AppLayout  Sidebar (9 link) + Ctrl+K komut paleti
src/pages/             8 sayfa
src/services/          Veri erişim katmanı (UI hiçbir yerde supabase'i doğrudan import etmez)
src/import/            ⚠️ ERİŞİLEMEZ ölü modül (bkz. Tuzaklar)
src/data/localData.ts  addressRecordService singleton'ı burada
supabase/migrations/   5 dosya
```

### Ekran durumları
| Ekran | Durum |
|---|---|
| Stocks, Product Detail, Addresses, Audit Logs | 🟢 Tamamlanmış, gerçek CRUD |
| Dashboard, Import, Export, Conflicts | 🟡 Kısmi |
| **Adres Bul** | 🔴 Tek satırlık fonksiyon — sadece stockCode+barkod arar |
| **Settings** | 🔴 Sadece tema butonu |
| **HomePage** | ⚫ 776 satır, hiç render edilmiyor |

---

## ⚠️ TUZAKLAR — Bunları Bilmeden Kod Yazma

1. **`src/pages/HomePage.tsx` ölü koddur.** [App.tsx:35](src/App.tsx#L35)'teki koşul
   9 `AppPage` değerinin hepsini dışlar → asla render edilmez. `src/import/*`,
   `dataBackup.ts`, `productSearch.ts`, `recentProducts.ts`, `ActionCard.tsx`
   **yalnızca** buradan çağrılır → hepsi erişilemez (~1.377 satır, %18).

2. **İki paralel import sistemi var.** Canlı olan `operationImportService.ts` +
   `OperationsPage.ImportHub`. Ölü olan `src/import/*` (daha gelişmiş, conflict
   üretiyor). **Sonuç: Conflicts ekranı canlı uygulamada asla veri almıyor.**

3. **Sayfalama yok → aktif veri kaybı.** `list()` / `listProducts()` `.range()`
   kullanmıyor. PostgREST max-rows=1000. `products` 1655 satır → dashboard
   "1000" gösteriyor. `getProductsWithAddressRecords` pencerenin dışında kalan
   adres kayıtlarından **sahte stub ürün** üretiyor (`barcodes: []`, uydurma id).

4. **`createProduct` transaction'sız.** INSERT products → DELETE barcodes →
   INSERT barcodes. 3. adım patlarsa barkodsuz orphan ürün kalır.

5. **Hata mapper'ı yanlış fonksiyonda.** [productService.ts:40](src/services/productService.ts#L40)
   `listProducts` içinde `mapProductCreateError` var; [satır 70](src/services/productService.ts#L70)
   `createProduct` ham hata fırlatıyor → duplicate stok kodu mesajı çalışmıyor.

6. **`base: './'` zorunlu.** [vite.config.ts](vite.config.ts) — kaldırılırsa
   production/paketlenmiş uygulama beyaz ekran verir (`file://` + mutlak yol).

7. **`dist-electron/` git'te takipli DEĞİL** (Sprint 0.1'de untrack edildi) ama
   `package.json` `main` alanı oraya bakıyor. Build çıktısı.

8. **Türkçe locale.** Çoğu yerde `toLocaleLowerCase('tr-TR')` kullanılıyor;
   Finder'da `toLowerCase()` (bug). Yeni kodda `tr-TR` kullan.

---

## Canlı Database Şeması (2026-09-09'da doğrulandı)

Şema `supabase/migrations/` içinde artık **tam olarak** mevcut.

### Tablolar
Satır sayıları 2026-09-09 18:32 anlıkdır; kullanıcı aktif veri girdiği için
değişir. Yapı sabittir.

| Tablo | Satır | RLS | Not |
|---|---|---|---|
| `products` | ~1677 | ✅ | `stock_code` UNIQUE (ham, `lower(trim())` DEĞİL) |
| `product_barcodes` | ~20 | ✅ | `barcode` UNIQUE (`lower(trim())`) · barkodlama yeni başladı |
| `address_records` | ~119 | ✅ | `carton_count >= 0` CHECK · ürünlerin ~%93'ünün adresi yok |
| `address_conflicts` | 0 | ✅ | SELECT-only, yazma RPC ile |
| `audit_logs` | ~1822 | ✅ | SELECT-only, yazma trigger ile |

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

### Fonksiyonlar
| Fonksiyon | anon EXECUTE |
|---|---|
| `clear_address_records(uuid)` | ❌ (Sprint 0.1'de revoke edildi) |
| `restore_address_records(jsonb,uuid)` | ❌ (Sprint 0.1'de revoke edildi) |
| `write_audit_log(...)` | ❌ |
| `create_address_conflict(...)` | ✅ (tasarım gereği) |
| `resolve_address_conflict(uuid,text,uuid)` | ✅ (tasarım gereği) |
| trigger fonksiyonları (4 adet) | ✅ ⚠️ gereksiz yüzey |

### Trigger'lar
```
products            → products_audit_trigger, products_set_updated_at
address_records     → address_records_audit_trigger, address_records_set_updated_at
product_barcodes    → product_barcodes_audit_trigger
address_conflicts   → address_conflicts_audit_trigger
```

### Veri kalitesi (2026-09-09 taraması)
Duplicate stok kodu **0**, orphan kayıt **0**, çift aktif adres **0**,
sıfır/negatif koli **0**, boşluk/case anomalisi **0**. **Veri tertemiz.**

---

## Bilinen Açık Sorunlar (öncelik sırasıyla)

| # | Sev | Sorun |
|---|---|---|
| 1 | 🔴 | **Sayfalama yok** — 655 ürün UI'da görünmüyor, import duplicate tespiti bozuk |
| 2 | 🔴 | **Auth yok** — anon key installer bundle'ında, anon tüm tablolara yazabiliyor |
| ~~3~~ | ✅ | ~~`xlsx@0.18.5` HIGH severity~~ → **0.20.3'e geçildi (2026-09-09), `npm audit` temiz.** `package.json` SheetJS CDN tarball'ını referans alır; npm registry'deki `xlsx` kullanılmamalı |
| 4 | 🟠 | `createProduct` transaction'sız + hata mapping bozuk |
| 5 | 🟠 | Import kısmi yazma, satır bazlı hata raporu yok |
| 6 | 🟠 | Conflict sistemi canlı uygulamada hiç tetiklenmiyor |
| 7 | 🟡 | ~~Supabase client tipsiz~~ → `createClient<Database>()` devrede (2026-09-09). Kalan iş: 14 adet `as unknown as` cast'inin temizliği (iç içe ilişki seçimlerinde nullable uyumsuzluğu var, dikkatli refactor ister) |
| 8 | 🟡 | Adres Bul kullanılamaz durumda (stok adı/adres araması yok) |
| 9 | 🟡 | Trigger fonksiyonları anon'a RPC olarak açık (Supabase linter) |
| 10 | 🟡 | `set_updated_at` / `audit_operation_id` mutable search_path |
| 11 | 🟡 | CSP yok, installer imzasız, ikon yok |
| 12 | 🟢 | Test yok, ESLint yok, CI yok |

---

## Çalışma Kuralları

- Mevcut mimariyi yeniden yazma; sprint kapsamı dışına çıkma.
- DB değişikliği **her zaman** migration üzerinden. `db push`/`db reset` yok.
- Canlı DB'yi elle değiştirme; migration yaz, kullanıcı uygulasın.
- Emin olmadığın şemayı tahmin etme — önce `execute_sql` ile teşhis et.
- Secret/API key asla commit etme. `.env` gitignore'da.
- Her değişiklikten sonra en azından `npm run typecheck`.
- Yıkıcı RPC/fonksiyonları argümanla test etme.

---

# Çalışma Günlüğü

## 2026-09-08 — Sprint 0.1: Production Build + RPC Security
**Commit:** `c64030f` *fix: stabilize production build and secure destructive rpc*

- 🔴→✅ **Production beyaz ekran çözüldü.** Kök sebep: Vite `base` ayarsız →
  `/assets/...` mutlak yolu `file://` altında sürücü köküne çözülüyordu.
  `vite.config.ts` → `base: './'`. CDP ile paketlenmiş `StokAdres.exe`
  üzerinde doğrulandı (React mount, 750 CSS kuralı, canlı veri, 0 hata).
- 🔴 **Yıkıcı RPC migration'ı yazıldı** (`20260908_revoke_destructive_rpc_grants.sql`).
  Kullanıcı aynı gün Supabase SQL Editor'da manuel revoke etti.
- 🔴→✅ **Barkod schema drift teşhis edildi.** `products.barcode` yok (42703);
  repo'daki `audit_products_trigger` bu kolona bakıyordu → uygulansaydı ürün
  oluşturmayı tamamen kıracaktı. `20260908_fix_audit_products_trigger_barcode_drift.sql`.
- Environment fallback kaldırıldı (`src/lib/supabase.ts`).
- `dist-electron/` untrack + `.gitignore` genişletildi.
- Installer üretildi: `release/StokAdres Setup 1.0.0.exe` (116 MB).

**Keşif:** Canlı DB repository'den ileride. Migration'lar canlıya bu haliyle
uygulanmamış.

## 2026-09-09 — Sprint 0.2: Live Schema Extraction
Supabase MCP bağlantısı açıldı → Sprint 0.1'de "BLOCKED" olan her şey çözüldü.

- ✅ **Revoke doğrulandı.** `clear_address_records` ve `restore_address_records`
  ACL'i `{postgres=X, service_role=X}` — anon/authenticated **false**.
- ✅ **Çekirdek şema repository'ye indirildi** →
  `20260904_create_core_schema.sql` (tablolar, unique index'ler, CHECK'ler,
  FK'ler, RLS policy'leri, `set_updated_at`). Artık boş projede kurulabilir.
- ✅ **Kayıp trigger bulundu ve eklendi** → `20260908_add_product_barcodes_audit_trigger.sql`.
  Gövde canlıdan `pg_get_functiondef()` ile birebir alındı.
- ✅ **Sprint 0.1 tahminim doğrulandı:** canlı `audit_products_trigger()` gövdesi
  yazdığım migration ile birebir aynı → uygulanması no-op.
- ✅ **Veri bütünlüğü taraması: sıfır bozukluk.** Tahmin ettiğim partial unique
  index (`product_id, lower(trim(address)) WHERE is_active`) gerçekten var.
- ⚠️ **Yeni bulgu:** `products` DELETE anon'a açık + `address_records`/
  `product_barcodes` CASCADE → tek ürün silme zincirleme siliyor.
- ⛔ **Yapılamadı (izin engeli):** `xlsx` CDN kurulumu ve
  `generate_typescript_types` otomatik izin sınıflandırıcısı tarafından
  engellendi. Kullanıcı onayı gerekiyor.

### Migration geçmişi kuruldu (aynı gün, ikinci tur)

- **Supabase'de migration geçmişi tamamen boştu** (`schema_migrations` tablosu
  bile yoktu) — DB elle SQL Editor'dan kurulmuş. Silinecek gereksiz migration
  **yoktu**.
- 🔴 **Dosya adları Supabase ile çalışamaz durumdaydı:** üç dosya `20260905`,
  iki dosya `20260908` versiyonunu paylaşıyordu (`version` benzersiz olmalı).
  Ayrıca `_conflict_rpc` alfabetik olarak `_conflicts`'ten önce geliyordu
  (`_` < `s`) → boş DB'de tablo yokken RPC yaratılır ve patlardı.
  **Tümü benzersiz + doğru sıralı versiyonlara taşındı** (içerik değişmedi).
- ✅ **4 migration canlıya uygulandı** (hepsi no-op, veri değişmedi):
  `create_core_schema`, `revoke_destructive_rpc_grants`,
  `fix_audit_products_trigger_barcode_drift`, `add_product_barcodes_audit_trigger`.
- ⚠️ **`20260905*` dosyaları BİLEREK çalıştırılmadı.** Yeniden çalıştırılırlarsa:
  (a) `clear_/restore_address_records` yetkilerini anon'a geri verirler,
  (b) `audit_products_trigger`'ı `products.barcode`'a bakan bozuk haliyle
  kurup ürün oluşturmayı kırarlar. İçerikleri canlıda özünde zaten mevcut.
- ✅ **Migration geçmişi tamamlandı.** Kullanıcı SQL Editor'da versiyon
  normalizasyonu + baseline insert'ünü çalıştırdı. `schema_migrations` artık
  7 satır ve versiyonlar repo dosya adlarıyla birebir eşleşiyor.

### `queries.md` incelemesi — veritabanının tarihçesi

Kullanıcının elle çalıştırdığı SQL geçmişi (`C:\Users\ysfll\Desktop\queries.md`)
incelendi. Bugünkü şemanın nasıl oluştuğunu açıklıyor:

- **Query 13 = barkod drift'inin kaynağı.** `ALTER TABLE products DROP COLUMN
  IF EXISTS barcode` + `audit_products_trigger`'ın barcode'suz yeniden yazımı.
  Repo migration'ı güncellenmediği için drift oluşmuş. Sprint 0.1 teşhisi
  birebir doğrulandı; `20260908000200` bunu artık kodluyor.
- **Query 14 ÇALIŞMADI (rollback).** Kanıt: ürettiği isimler canlıda yok
  (`idx_product_barcodes_unique_normalized`, `product_barcodes_public_*`).
  Sebep: 6. adımı `select ... from products p where p.barcode is not null`
  içeriyor; Query 13 kolonu düşürdüğü için 42703 → SQL Editor transaction'ı
  geri aldı. **Kazanan Query 15**; canlıdaki index/policy isimleri onunki.
  Repo'daki `20260904000000_create_core_schema.sql` de Query 15'le uyumlu
  (canlıdan türetildiği için).
- **Veri kaybı YOK.** Query 14'ün başarısız olan 6. adımı eski
  `products.barcode` değerlerini taşıyacaktı. Ama `audit_logs`'ta
  `product-created` + `barcode` anahtarı içeren **0 kayıt** var → kolon hiç
  dolu olmamış, taşınacak veri yoktu.
- **Query 11 vs 12:** ikisi de `audit_product_barcodes_trigger` yaratıyor.
  Query 12'de DELETE dalındaki "ürün hâlâ var mı" guard'ı YOK, Query 11'de VAR.
  Canlı = Query 11 → repo'daki `20260908000300` de guard'lı ✓
- **Query 19 → 17 sırası:** Query 19 `address_conflicts`'e insert/update
  policy'leri açıyor, Query 17 onları kapatıp sadece select bırakıyor.
  Canlı = Query 17'nin son hali ✓
- **Query 8:** `products.is_active` sonradan eklenmiş; core schema'da var ✓
- **Query 10** = `20260908000100_revoke_destructive_rpc_grants.sql` ile aynı iş.
- **Query 18** = `20260905000300_create_audit_logs.sql`. Bozuk trigger'ın ve
  anon grant'lerinin kaynağı. Baseline'landı, bir daha çalıştırılmayacak.

**Sıfırdan kurulum kontrolü:** Migration sırası (`0904 → 0905x3 → 0908x3`) boş
bir DB'de doğru son duruma ulaşır. `20260905000300` bozuk trigger'ı kurar ama
plpgsql gövdeyi çalışma anında çözdüğü için hata vermez; `20260908000200`
hemen ardından düzeltir. Arada `products`'a insert olmadığı için risk yok.

### Bekleyen iki iş de tamamlandı (aynı gün, üçüncü tur)

- ✅ **`xlsx` 0.18.5 → 0.20.3.** `package.json` artık SheetJS CDN tarball'ını
  referans alıyor (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`),
  lock dosyasında integrity hash var → reproducible. **`npm audit`: 0 açık.**
  Kod değişikliği sıfır; kullanılan 6 API aynı imzada. Round-trip testi
  yapıldı: export → import, Türkçe karakterler (`İĞNE ÇİÇEK ŞĞÜÖ`) korundu,
  CSV yolu da çalışıyor. Bundle 942 → 1008 kB.
- ✅ **`src/types/database.ts` üretildi** ve `createClient<Database>()` devreye
  alındı. Daha ilk typecheck'te gerçek bir tip hatası yakaladı:
  `conflictService.ts`'te `p_incoming_barcode` / `p_source` null gönderiliyordu
  ama Supabase tip üreteci varsayılanı olmayan fonksiyon parametrelerini
  NOT NULL üretiyor. Postgres tarafında ikisi de nullable → dar bir cast ile
  çözüldü, çalışma zamanı davranışı değişmedi.
- ⚠️ **Şema değişince `src/types/database.ts` yeniden üretilmeli**
  (`generate_typescript_types` veya `supabase gen types typescript`).

**Sonraki adım:** Sprint 0.3 — Pagination (Açık Sorun #1). Artık index
envanteri ve tipler elimizde olduğu için güvenle yapılabilir.
