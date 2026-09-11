# Tek seferlik yardımcı script'ler

Bu klasördeki dosyalar **uygulamanın parçası değildir**. Elle, tek seferlik
işler için çalıştırılır ve bundle'a girmez.

---

## 100.000 ürünü ilk kez yükleme

### Neden uygulamanın "İçe Aktar" ekranı değil?

Uygulamanın içe aktarma akışı ürün başına 3-4 HTTP isteği atar ve bunları
sırayla yapar. 100.000 üründe bu 300-400 bin istek, yani saatler demek.
Tek seferlik ilk yükleme için doğru araç, toplu insert yapan bu script.

Supabase panelinin CSV yükleyicisi de bir seçenek ama 100k satırda zorlanır ve
hangi satırın neden reddedildiğini söylemez. Script hata veren partiyi ve
sebebini yazar.

### Adım 1 — Excel'i CSV'ye çevir

Excel'de **Farklı Kaydet** → biçim olarak **"CSV UTF-8 (virgülle ayrılmış)"**.

> ⚠️ Düz **"CSV (virgülle ayrılmış)"** seçeneğini seçmeyin. Türkçe karakterleri
> (Ç, Ğ, İ, Ö, Ş, Ü) bozar ve veritabanına bozuk yazılır. Sonradan düzeltmek
> yeniden yükleme gerektirir.

Dosyada başlık satırı olmalı. Tanınan kolon adları (büyük/küçük harf farketmez):

| Alan | Kabul edilen başlıklar | Zorunlu |
|---|---|---|
| Stok kodu | `Stok Kodu`, `stock_code`, `Kod`, `Ürün Kodu` | ✅ |
| Stok adı | `Stok Adı`, `stock_name`, `Stok İsmi`, `Ürün Adı` | ✅ |
| Barkod | `Barkod`, `barcode`, `EAN` | opsiyonel |

Fazladan kolonlar yok sayılır — CABA çıktısını olduğu gibi verebilirsiniz.

### Adım 2 — Önce prova (hiçbir şey yazmaz)

```bash
node scripts/bulk-load-products.mjs urunler.csv --dry-run
```

Bu komut hiçbir şey yazmaz, sadece raporlar:

```
Kolonlar: stok kodu=0, stok adi=1, barkod=2

Dosya   : 100000 veri satiri
Gecerli : 99847
Eksik alanli (atlanacak): 12  ornek satir 4471, 8890, 12043
Dosya ici tekrar (atlanacak): 141  ornek satir 233, 981, 1502

Mevcut stok kodlari okunuyor...
Veritabaninda 1677 urun var.
Zaten kayitli (atlanacak): 1677

YUKLENECEK: 98170 urun
```

**Bu çıktıyı kontrol edin.** Sayılar beklediğinizden çok farklıysa (ör. "Geçerli"
çok düşükse) kolon başlıkları yanlış eşleşmiş olabilir — dosyayı düzeltip
provayı tekrarlayın.

### Adım 3 — Önce küçük bir örnekle deneyin

100.000 satırı ilk denemede yüklemeyin. Excel'den ilk ~5.000 satırı ayrı bir
dosyaya alıp önce onu yükleyin:

```bash
node scripts/bulk-load-products.mjs ornek-5000.csv
```

Sonra uygulamayı açıp kontrol edin: Stoklar listesi, arama, Genel Bakış
sayaçları. Sorun yoksa tam dosyaya geçin.

### Adım 4 — Tam yükleme

```bash
node scripts/bulk-load-products.mjs urunler.csv
```

500'lük partiler halinde yazar ve ilerlemeyi gösterir.

### Güvenlik ve tekrar çalıştırma

- Script **yalnızca INSERT yapar**. Hiçbir satırı silmez veya güncellemez.
- Zaten kayıtlı stok kodlarını atlar, yani **tekrar çalıştırmak güvenlidir**.
  Yarıda kesilirse aynı komutu tekrar verin; kaldığı yerden devam etmiş olur.
- `.env` dosyasındaki anon anahtarını kullanır, ayrıca bir şey vermeniz gerekmez.

### Yükleme sonrası

Ürünler yüklendikten sonra veritabanı istatistiklerini tazelemek iyi olur;
sorgu planlayıcısı doğru index'i seçsin diye. Supabase SQL Editor'de:

```sql
analyze public.products;
analyze public.product_barcodes;
```

Bu, arama index'lerinin (`pg_trgm`) 100k satırda doğru kullanılmasını sağlar.

---

## Yedekten kurtarma

Uygulama **Ayarlar → Yedek Al** ile `Belgeler\StokAdres Yedekleri\` klasörüne
tek bir Excel yazar. Uygulamada geri yükleme düğmesi **bilerek yok**: geri yükleme
mevcut veriyi değiştiren bir işlem ve ancak gerçekten gerektiğinde, bilinçli
yapılmalı.

Yedek dosyasındaki sayfalar:

| Sayfa | İçerik |
|---|---|
| `Bilgi` | Yedek tarihi ve satır sayıları |
| `Stoklar` | `products` tablosunun tüm kolonları (`id` dahil) |
| `Barkodlar` | `product_barcodes` + okunabilirlik için başta `stock_code` |
| `Adresler` | `address_records` + okunabilirlik için başta `stock_code` |

`id`'ler korunduğu için ürün, barkod ve adres ilişkileri yedekten birebir
kurulabilir. `audit_logs` (işlem geçmişi) yedekte yok.

### Önce: gerçekten veri mi kayboldu?

Uygulama "Veritabanına ulaşılamıyor" diyorsa büyük olasılıkla **proje
durdurulmuştur**. Ücretsiz Supabase projeleri 7 gün kullanılmayınca durur;
veri silinmez. supabase.com → StokAdres projesi → **Restore**. Yedeğe gerek
yoktur.

### Gerçek veri kaybında

1. Hedef projede şema hazır olmalı (`supabase/migrations/` sırayla).
2. Yedek Excel'inden her sayfayı ayrı **CSV UTF-8** olarak kaydedin.
   `Barkodlar` ve `Adresler` sayfalarında baştaki `stock_code` kolonunu silin;
   tabloda böyle bir kolon yok.
3. Supabase → Table Editor → tablo → **Import data from CSV**, şu sırayla
   (yabancı anahtarlar yüzünden sıra önemli):
   `products` → `product_barcodes` → `address_records`.
4. Uygulamayı açıp Genel Bakış sayılarını yedeğin `Bilgi` sayfasıyla
   karşılaştırın.

> ⚠️ İçe aktarma sırasında audit trigger'ları her satır için bir işlem geçmişi
> kaydı üretir. Bu zararsızdır ama İşlem Geçmişi ekranı kalabalıklaşır.
>
> Bu prosedür henüz bir tatbikatla uçtan uca denenmedi. Gerçek bir kayıpta önce
> boş bir test projesinde denemek en güvenlisi.
