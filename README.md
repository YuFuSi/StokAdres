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

Uygulama ürün, barkod ve fiziksel adres kayıtlarını Supabase üzerinden yönetir. Electron + React + TypeScript + Vite yapısında çalışır; adres kayıtları uygulama yeniden açıldığında Supabase'den yeniden yüklenir.

İçe aktarma ekranı CSV, XLSX ve XLS dosyalarında stok adı güncelleme, barkod atama, adres/koli aktarımı ve CABA adres eşleştirmesi sunar. Veri yazılmadan önce önizleme ve kullanıcı onayı gerekir. Dışa aktarma CSV (UTF-8 BOM) ve Excel (`.xlsx`) formatlarında Electron kaydetme diyaloğu kullanarak dosya oluşturur.
