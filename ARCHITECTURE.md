# Suur mimarisi

Suur ilk sürümde tek container içinde çalışan modüler bir monolit olarak tasarlandı. Bu seçim kurulum, güncelleme ve yedeklemeyi basit tutarken frontend ile REST API arasında gereksiz ağ katmanları oluşturmaz.

## Çalışma akışı

1. Next.js arayüzü tarayıcıda çalışır ve `/api/*` REST uçlarını kullanır.
2. API istekleri Zod ile doğrulanır; not güncellemeleri sürüm numarasıyla çakışmalara karşı korunur.
3. `better-sqlite3`, `/data/suur.db` dosyasını WAL modunda kullanır.
4. Görseller `/data/uploads` altında, ilişkili meta veriler SQLite içinde saklanır.
5. Service worker uygulama kabuğunu ve son başarılı GET yanıtlarını önbellekler.
6. IndexedDB, çevrimdışı not değişikliklerini işlem kimliğiyle sıraya alır. Bağlantı geldiğinde istekler idempotent şekilde yeniden oynatılır. Eşzamanlı düzenleme çakışırsa içerik ayrı bir “çakışan kopya” olarak korunur.

## Klasör yapısı

```text
app/
  api/                 REST API route'ları
  globals.css          Tema ve responsive tasarım
  layout.tsx           PWA/SEO metadata
  page.tsx             Ana uygulama girişi
components/
  suur-app.tsx         Uygulama durumu ve senkronizasyon
  note-card.tsx        Grid/liste not kartı
  note-editor.tsx      Not ve checklist editörü
lib/
  db.ts                SQLite bağlantısı ve şema
  repository.ts        Veri erişim katmanı
  validation.ts        Girdi doğrulama
  offline.ts           IndexedDB önbellek ve işlem kuyruğu
public/
  manifest.webmanifest PWA bildirimi
  sw.js                Offline service worker
Dockerfile             Çok aşamalı production imajı
compose.yml            Kalıcı volume ve healthcheck
```

## Kalıcı veri

Tüm kullanıcı verisi yalnızca `/data` altındadır:

```text
/data/suur.db
/data/suur.db-wal
/data/suur.db-shm
/data/uploads/*
```

Compose varsayılan olarak bu dizini `suur-data` adlı Docker volume’una bağlar. Container veya imaj yeniden oluşturulduğunda volume korunur.
