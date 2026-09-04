# StokAdres

Stok ve adresleme yönetimi için yerel Electron masaüstü uygulaması.

## Geliştirme

```bash
npm install
npm run dev
```

Renderer çıktısını üretmek ve Electron ana sürecini derlemek için:

```bash
npm run build
```

Derleme sonrasında masaüstü uygulamasını açmak için:

```bash
npm start
```

## Mevcut kapsam

İlk iki aşamada Electron + React + TypeScript + Vite iskeleti, ürün modelleri, demo ürün verileri, ürün arama servisi ve lokal adres kayıt servisi bulunur. Veritabanı, Excel işlemleri, giriş sistemi, backend/API ve adres kayıt ekranı henüz eklenmemiştir.

Adres kayıt servisi bellekte çalışır ve uygulama kapanınca veriler kalıcı olarak saklanmaz. Bu sınır, ileride SQLite tabanlı bir depolama katmanına geçiş için korunmuştur.
