# Suur

Suur; hızlı, sade, mobil uyumlu ve tamamen self-hosted bir not uygulamasıdır. Notlar, etiketler, ayarlar ve görseller yalnızca kendi sunucunuzdaki kalıcı Docker volume’unda tutulur.

## Hızlı kurulum

Gerekenler: Docker Engine ve Docker Compose v2.

```bash
cp .env.example .env
docker compose up -d --build
```

Ardından `http://SUNUCU_IP:3721` adresini açın. İlk build birkaç dakika sürebilir.

İlk kurulum hesabı:

```text
Kullanıcı adı: alaferoce
Parola: 7Admin7
```

Bu hesap `superadmin` yetkisiyle oluşturulur. İlk girişten sonra **Ayarlar > Profil** bölümünden parolayı değiştirin. İlk veritabanı oluşturulmadan önce bu değerler `.env` içindeki `SUUR_DEFAULT_USERNAME` ve `SUUR_DEFAULT_PASSWORD` ile değiştirilebilir.

Portu değiştirmek için `.env` içindeki `SUUR_PORT` değerini düzenleyin:

```dotenv
SUUR_PORT=8088
SUUR_PUBLIC_URL=http://SUNUCU_IP:8088
```

Çalışma durumunu kontrol etmek için:

```bash
docker compose ps
docker compose logs -f suur
```

## İlk sürümde çalışan özellikler

- Metin notu ve checklist oluşturma/düzenleme
- Otomatik kayıt ve sürüm çakışması koruması
- Sabitleme, arşiv, çöp kutusu, geri yükleme ve kalıcı silme
- Etiket oluşturma, silme ve notlara etiket ekleme
- Görsel yükleme ve kaldırma
- Not renkleri ve tarih/saat hatırlatıcıları
- Arama, grid/liste görünümü ve sürükle-bırak sıralama
- Açık/koyu tema ve tam responsive mobil arayüz
- Kurulabilir PWA, offline görüntüleme ve çevrimdışı düzenleme kuyruğu
- Not kartına tıklayınca salt okunur görünüm, ayrı düzenleme düğmesi
- Yerleşik kullanıcı girişi, kullanıcıya özel notlar ve profil fotoğrafı
- Superadmin tarafından kullanıcı ekleme ve rol yönetimi
- Google Keep Takeout ZIP/JSON içe aktarma

Tarayıcı bildirimleri ve zamanlanmış sunucu bildirimleri bu temelde henüz yoktur; ilk sürüm hatırlatıcıları not üzerinde ve Hatırlatıcılar görünümünde saklar/gösterir.

## Veriler ve yedekleme

Kalıcı veriler `suur-data` volume’undadır. Container silinse veya güncellense bile volume ayrıca silinmediği sürece veriler korunur.

Tutarlı bir yedek almak için önce uygulamayı durdurun:

```bash
mkdir -p backups
docker compose stop suur
docker run --rm --user 0 -v suur-data:/data:ro -v "$PWD/backups":/backup suur:local \
  tar -czf /backup/suur-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
docker compose start suur
```

Bind mount tercih ediyorsanız `compose.yml` içindeki volume satırını `./data:/data` olarak değiştirebilirsiniz. Bu durumda `data/` klasörünün container içindeki UID 1000 tarafından yazılabilir olduğundan emin olun.

## Güncelleme

```bash
docker compose up -d --build
```

Compose mevcut `suur-data` volume’unu yeniden kullanır. Büyük güncellemelerden önce yedek alın.

## PWA ve offline çalışma

Suur HTTPS altında veya `localhost` üzerinden açıldığında Android, iOS ve masaüstünde kurulabilir. Son görüntülenen notlar kullanıcıya ayrılmış IndexedDB alanında bulunur. Çevrimdışı metin/checklist düzenlemeleri sıraya alınır ve bağlantı geri geldiğinde senkronize edilir. Kimlik doğrulama güvenliği için uygulama sayfaları ile API yanıtları ortak service worker önbelleğine yazılmaz. Görsel yüklemek ve yeni bir oturum açmak için bağlantı gerekir.

## CasaOS

CasaOS’ta Compose uygulaması olarak bu klasörü içe aktarın. `SUUR_PORT` host portunu, `3000` ise container portunu temsil eder. Kalıcı volume’u silmediğiniz sürece uygulama güncellemeleri kullanıcı verisini etkilemez.

Hazır container image her `main` güncellemesinde GitHub Container Registry’ye yayınlanır:

```text
ghcr.io/hng3444/suur:latest
```

CasaOS Manuel Uygulama Kurulumu ekranında container portu `3000`, host portu `3721`, kalıcı host klasörü `/DATA/AppData/suur`, container klasörü `/data` olmalıdır. Image ilk yayınlandıktan sonra GitHub Packages ayarından görünürlüğünü `Public` yapın.

## Güvenlik notu

Suur; HttpOnly, SameSite oturum çerezi ve scrypt ile özetlenen parolalar kullanan yerleşik çok kullanıcılı kimlik doğrulama içerir. Kullanıcıların notları, etiketleri, ayarları ve offline tarayıcı verileri birbirinden ayrıdır. İnternete açacaksanız HTTPS kullanan bir reverse proxy kullanın ve varsayılan parolayı hemen değiştirin. Docker imajı root olmayan kullanıcıyla ve `no-new-privileges` ile çalışır; uygulama telemetrisi kapalıdır.

Mimari ayrıntılar için [ARCHITECTURE.md](ARCHITECTURE.md) dosyasına bakın.
