# StokAdres

Depo stok ve fiziksel adres (raf/koli) takibi için yerel Electron masaüstü
uygulaması. Veri Supabase'te tutulur; arayüz Türkçedir.

Proje hafızası, mimari ve bilinen tuzaklar için: [CLAUDE.md](CLAUDE.md).

## Ekranlar

| Ekran | İşi |
|---|---|
| Genel Bakış | Toplamlar, sayım ilerlemesi, yedek hatırlatıcısı |
| Stoklar · Ürün Detayı | Ürün arama, barkod ve adres düzenleme |
| Adresler | Adres kayıtları; adres, koli ve durum hücrede düzenlenir |
| Adres Bul | Stok kodu, ad, barkod veya adresle arama |
| Çıktı Al | CABA fişi, adres aralığı ya da seçili ürünlerden adres listesi; yazdır veya Excel |
| İçe Aktar | Excel/CSV veya yapıştırma; önizleme ve düzeltmeden sonra yazar |
| Dışa Aktar | Stoklar, adresler ve özet; CSV veya Excel |
| İşlem Geçmişi | Değişikliklerin eski/yeni değerleri |
| Ayarlar | Tema, bağlantı durumu, tek tıkla yedek (CSV klasörü) |

## Kurulum

Proje kökünde `.env` gerekir (git'te yok):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Komutlar

```bash
npm install
npm run dev        # Vite + Electron
npm run typecheck
npm test
npm run build:win  # kurulum dosyası → release/
```

Veritabanı değişiklikleri yalnızca `supabase/migrations/` üzerinden yapılır.
