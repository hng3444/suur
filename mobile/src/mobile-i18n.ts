import { languageDirection, normalizeLocale, translate } from '../../lib/i18n.ts';
import type { Locale } from '../../lib/types.ts';

const copy = {
  en: {
    connectTitle: 'Connect to your Suur', serverAddress: 'Server address', continue: 'Continue', checking: 'Checking server…',
    connectHelp: 'Enter the HTTPS address of your self-hosted Suur server.', compatible: 'Compatible server',
    deviceLogin: 'Sign in on this device', signInHelp: 'Your password is sent only to your server and is never saved on this device.',
    connectionFailed: 'Could not reach a compatible Suur server.', apiMismatch: 'This server must be updated before the mobile app can connect.',
    offlineReady: 'Offline notes are ready', pending: '{count} change(s) waiting', syncNow: 'Sync now', signOut: 'Disconnect',
    signOutHelp: 'Cached notes stay on this device and can be recovered by signing in again.', noNotes: 'No notes here yet',
    addText: 'Text note', addChecklist: 'Checklist', note: 'Note', checklist: 'Checklist', labels: 'Labels',
    reminder: 'Reminder', noteColor: 'Color', cancel: 'Cancel', save: 'Save', addItem: 'Add item',
    archived: 'Archived', trashed: 'In trash', restore: 'Restore', deleteForever: 'Delete forever',
    settings: 'Appearance', view: 'View', grid: 'Grid', list: 'List', theme: 'Theme', system: 'System', light: 'Light', dark: 'Dark',
    cachedAttachment: 'Attachment available when online', authRequired: 'Sign in again to synchronize. Your offline notes are safe.',
    retryLogin: 'Sign in again', syncBlocked: 'A local change needs attention before synchronization can continue.',
    filters: 'Search filters', activeFilters: '{count} active filters', filterHelp: 'Find exactly what you need', noteType: 'Note type', all: 'All', textNote: 'Text note',
    color: 'Color', withReminder: 'With reminder', withoutReminder: 'Without reminder', updated: 'Updated', allTime: 'Any time', today: 'Last 24 hours', week: 'Last 7 days', month: 'Last 30 days',
    noLabels: 'No labels yet', noRemindersMonth: 'No reminders this month', create: 'Create', shared: 'Shared', edited: 'Edited', untitled: 'Untitled note', duplicate: 'Make a copy', shareLink: 'Share read-only link', history: 'Note history', historyHelp: 'Restore an earlier version', noHistory: 'No earlier version yet',
    image: 'Image', file: 'File', voice: 'Voice note', stop: 'Stop recording', recording: 'Recording', microphoneDenied: 'Microphone permission was not granted.', onlineRequired: 'A server connection is required for this action.', saveBeforeAttachment: 'Save this note before adding an attachment.', uploading: 'Adding attachment…', uploadComplete: 'Attachment added', onlyMe: 'Only me', failed: 'The action could not be completed.', voiceHelp: 'Speak clearly. Your recording is added to this note when you stop.', markdownEnabled: 'Markdown mode is on', editText: 'Edit text', previewText: 'Preview',
    appearanceHelp: 'Make Suur feel right for you', accentColor: 'Accent color', backgroundTone: 'Background tone', completedBottom: 'Move checked items to the bottom', completedBottomHelp: 'Keeps unfinished checklist items together', notifications: 'Reminder notifications', notificationsHelp: 'Show reminders even when Suur is closed', advancedHelp: 'Control note behavior and server maintenance', automaticBackup: 'Automatic backup', off: 'Off', daily: 'Daily', weekly: 'Weekly', trashCleanup: 'Automatically empty trash', days: 'days', changePhoto: 'Change photo', displayName: 'Display name', currentPassword: 'Current password', newPassword: 'New password', saveProfile: 'Save profile', profileSaved: 'Profile saved',
    dataHelp: 'Move, download, or restore your notes', export: 'Export', import: 'Import', fullBackup: 'Full backup', exportReady: 'Export is ready', importComplete: 'Import completed', serverBackups: 'Server backups', backupCreated: 'Backup created', noBackups: 'No backup has been created yet', administration: 'Administration', adminHelp: 'Manage branding and people', appName: 'Application name', applicationBranding: 'Application icon', customIconActive: 'Custom icon is active', originalIconActive: 'Original Suur icon is active', uploadIcon: 'Upload .ico', storageQuota: 'Storage quota (MB)', deleteUser: 'Delete this user and all of their data?', createUser: 'Add user', userCreated: 'User created', saved: 'Saved', server: 'Server',
  },
  tr: {
    connectTitle: 'Suur sunucuna bağlan', serverAddress: 'Sunucu adresi', continue: 'Devam et', checking: 'Sunucu kontrol ediliyor…',
    connectHelp: 'Kendi sunucundaki Suur’un HTTPS adresini yaz.', compatible: 'Uyumlu sunucu',
    deviceLogin: 'Bu cihazda giriş yap', signInHelp: 'Şifren yalnızca kendi sunucuna gönderilir ve bu cihazda kaydedilmez.',
    connectionFailed: 'Uyumlu bir Suur sunucusuna ulaşılamadı.', apiMismatch: 'Mobil uygulamanın bağlanabilmesi için sunucunun güncellenmesi gerekiyor.',
    offlineReady: 'Çevrimdışı notlar hazır', pending: '{count} değişiklik bekliyor', syncNow: 'Şimdi eşitle', signOut: 'Bağlantıyı kaldır',
    signOutHelp: 'Önbellekteki notlar cihazda kalır; tekrar giriş yapınca kullanılabilir.', noNotes: 'Burada henüz not yok',
    addText: 'Metin notu', addChecklist: 'Yapılacaklar listesi', note: 'Not', checklist: 'Liste', labels: 'Etiketler',
    reminder: 'Hatırlatıcı', noteColor: 'Renk', cancel: 'Vazgeç', save: 'Kaydet', addItem: 'Madde ekle',
    archived: 'Arşivlendi', trashed: 'Çöp kutusunda', restore: 'Geri yükle', deleteForever: 'Kalıcı sil',
    settings: 'Görünüm', view: 'Görünüm biçimi', grid: 'Izgara', list: 'Liste', theme: 'Tema', system: 'Sistem', light: 'Açık', dark: 'Karanlık',
    cachedAttachment: 'Dosya çevrimiçiyken kullanılabilir', authRequired: 'Eşitlemek için tekrar giriş yap. Çevrimdışı notların güvende.',
    retryLogin: 'Tekrar giriş yap', syncBlocked: 'Eşitlemenin sürmesi için yerel bir değişikliğin kontrol edilmesi gerekiyor.',
    filters: 'Arama filtreleri', activeFilters: '{count} etkin filtre', filterHelp: 'Aradığını tam olarak bul', noteType: 'Not türü', all: 'Tümü', textNote: 'Metin notu',
    color: 'Renk', withReminder: 'Hatırlatıcılı', withoutReminder: 'Hatırlatıcısız', updated: 'Güncellenme', allTime: 'Tüm zamanlar', today: 'Son 24 saat', week: 'Son 7 gün', month: 'Son 30 gün',
    noLabels: 'Henüz etiket yok', noRemindersMonth: 'Bu ay hatırlatıcı yok', create: 'Oluştur', shared: 'Paylaşılan', edited: 'Düzenlendi', untitled: 'Başlıksız not', duplicate: 'Kopyasını oluştur', shareLink: 'Salt-okunur bağlantıyı paylaş', history: 'Not geçmişi', historyHelp: 'Önceki bir sürümü geri yükle', noHistory: 'Henüz önceki sürüm yok',
    image: 'Görsel', file: 'Dosya', voice: 'Sesli not', stop: 'Kaydı bitir', recording: 'Kayıt sürüyor', microphoneDenied: 'Mikrofon izni verilmedi.', onlineRequired: 'Bu işlem için sunucu bağlantısı gerekiyor.', saveBeforeAttachment: 'Dosya eklemeden önce notu kaydet.', uploading: 'Dosya ekleniyor…', uploadComplete: 'Dosya eklendi', onlyMe: 'Yalnızca ben', failed: 'İşlem tamamlanamadı.', voiceHelp: 'Net konuşun. Bitirdiğinizde kayıt bu nota eklenir.', markdownEnabled: 'Markdown modu açık', editText: 'Metni düzenle', previewText: 'Önizleme',
    appearanceHelp: 'Suur’u kendine göre düzenle', accentColor: 'Vurgu rengi', backgroundTone: 'Arka plan tonu', completedBottom: 'Tamamlananları alta taşı', completedBottomHelp: 'Bitmemiş liste öğelerini bir arada tutar', notifications: 'Hatırlatıcı bildirimleri', notificationsHelp: 'Suur kapalıyken de bildirim gösterir', advancedHelp: 'Not davranışını ve sunucu bakımını yönet', automaticBackup: 'Otomatik yedekleme', off: 'Kapalı', daily: 'Her gün', weekly: 'Her hafta', trashCleanup: 'Çöpü otomatik temizle', days: 'gün', changePhoto: 'Fotoğrafı değiştir', displayName: 'Görünen ad', currentPassword: 'Mevcut şifre', newPassword: 'Yeni şifre', saveProfile: 'Profili kaydet', profileSaved: 'Profil kaydedildi',
    dataHelp: 'Notlarını taşı, indir veya geri yükle', export: 'Dışa aktar', import: 'İçe aktar', fullBackup: 'Tam yedek', exportReady: 'Dışa aktarma hazır', importComplete: 'İçe aktarma tamamlandı', serverBackups: 'Sunucu yedekleri', backupCreated: 'Yedek oluşturuldu', noBackups: 'Henüz yedek oluşturulmadı', administration: 'Yönetim', adminHelp: 'Markayı ve kullanıcıları yönet', appName: 'Uygulama adı', applicationBranding: 'Uygulama simgesi', customIconActive: 'Özel simge kullanılıyor', originalIconActive: 'Orijinal Suur simgesi kullanılıyor', uploadIcon: '.ico yükle', storageQuota: 'Depolama kotası (MB)', deleteUser: 'Bu kullanıcı ve tüm verileri silinsin mi?', createUser: 'Kullanıcı ekle', userCreated: 'Kullanıcı oluşturuldu', saved: 'Kaydedildi', server: 'Sunucu',
  },
} as const;

type MobileCopyKey = keyof typeof copy.en;

const additionalCopy: Record<Locale, Partial<Record<MobileCopyKey, string>>> = {
  en: copy.en,
  tr: copy.tr,
  zh: { connectTitle:'连接你的 Suur',serverAddress:'服务器地址',continue:'继续',checking:'正在检查…',deviceLogin:'在此设备登录',syncNow:'立即同步',signOut:'断开连接',noNotes:'这里还没有笔记',save:'保存',cancel:'取消',filters:'搜索筛选',filterHelp:'准确找到所需内容',all:'全部',textNote:'文字笔记',checklist:'清单',color:'颜色',labels:'标签',reminder:'提醒',history:'笔记历史',duplicate:'创建副本',shareLink:'分享只读链接',settings:'设置',theme:'主题',view:'视图',grid:'网格',list:'列表',system:'系统',light:'浅色',dark:'深色',create:'创建',edited:'已编辑',untitled:'无标题笔记',shared:'共享',administration:'管理',export:'导出',import:'导入' },
  hi: { connectTitle:'अपने Suur से जुड़ें',serverAddress:'सर्वर पता',continue:'जारी रखें',checking:'जाँच हो रही है…',deviceLogin:'इस डिवाइस पर साइन इन करें',syncNow:'अभी सिंक करें',signOut:'डिस्कनेक्ट करें',noNotes:'यहाँ अभी कोई नोट नहीं',save:'सहेजें',cancel:'रद्द करें',filters:'खोज फ़िल्टर',filterHelp:'ठीक वही पाएँ जो चाहिए',all:'सभी',textNote:'टेक्स्ट नोट',checklist:'चेकलिस्ट',color:'रंग',labels:'लेबल',reminder:'रिमाइंडर',history:'नोट इतिहास',duplicate:'कॉपी बनाएँ',shareLink:'केवल-पढ़ने का लिंक साझा करें',settings:'सेटिंग्स',theme:'थीम',view:'दृश्य',grid:'ग्रिड',list:'सूची',system:'सिस्टम',light:'हल्का',dark:'गहरा',create:'बनाएँ',edited:'संपादित',untitled:'बिना शीर्षक का नोट',shared:'साझा',administration:'प्रशासन',export:'निर्यात',import:'आयात' },
  es: { connectTitle:'Conecta tu Suur',serverAddress:'Dirección del servidor',continue:'Continuar',checking:'Comprobando…',deviceLogin:'Inicia sesión en este dispositivo',syncNow:'Sincronizar ahora',signOut:'Desconectar',noNotes:'Aún no hay notas aquí',save:'Guardar',cancel:'Cancelar',filters:'Filtros de búsqueda',filterHelp:'Encuentra exactamente lo que necesitas',all:'Todo',textNote:'Nota de texto',checklist:'Lista',color:'Color',labels:'Etiquetas',reminder:'Recordatorio',history:'Historial de la nota',duplicate:'Crear una copia',shareLink:'Compartir enlace de solo lectura',settings:'Ajustes',theme:'Tema',view:'Vista',grid:'Cuadrícula',list:'Lista',system:'Sistema',light:'Claro',dark:'Oscuro',create:'Crear',edited:'Editado',untitled:'Nota sin título',shared:'Compartido',administration:'Administración',export:'Exportar',import:'Importar' },
  ar: { connectTitle:'اتصل بخادم Suur',serverAddress:'عنوان الخادم',continue:'متابعة',checking:'جارٍ التحقق…',deviceLogin:'تسجيل الدخول على هذا الجهاز',syncNow:'مزامنة الآن',signOut:'قطع الاتصال',noNotes:'لا توجد ملاحظات هنا بعد',save:'حفظ',cancel:'إلغاء',filters:'عوامل تصفية البحث',filterHelp:'اعثر على ما تحتاجه بالضبط',all:'الكل',textNote:'ملاحظة نصية',checklist:'قائمة مهام',color:'اللون',labels:'التصنيفات',reminder:'تذكير',history:'سجل الملاحظة',duplicate:'إنشاء نسخة',shareLink:'مشاركة رابط للقراءة فقط',settings:'الإعدادات',theme:'المظهر',view:'العرض',grid:'شبكة',list:'قائمة',system:'النظام',light:'فاتح',dark:'داكن',create:'إنشاء',edited:'تم التعديل',untitled:'ملاحظة بلا عنوان',shared:'مشتركة',administration:'الإدارة',export:'تصدير',import:'استيراد' },
  fr: { connectTitle:'Connectez votre Suur',serverAddress:'Adresse du serveur',continue:'Continuer',checking:'Vérification…',deviceLogin:'Se connecter sur cet appareil',syncNow:'Synchroniser',signOut:'Déconnecter',noNotes:'Aucune note ici',save:'Enregistrer',cancel:'Annuler',filters:'Filtres de recherche',filterHelp:'Trouvez exactement ce dont vous avez besoin',all:'Tout',textNote:'Note texte',checklist:'Liste',color:'Couleur',labels:'Libellés',reminder:'Rappel',history:'Historique de la note',duplicate:'Créer une copie',shareLink:'Partager le lien en lecture seule',settings:'Paramètres',theme:'Thème',view:'Affichage',grid:'Grille',list:'Liste',system:'Système',light:'Clair',dark:'Sombre',create:'Créer',edited:'Modifié',untitled:'Note sans titre',shared:'Partagé',administration:'Administration',export:'Exporter',import:'Importer' },
  bn: { connectTitle:'আপনার Suur-এ সংযোগ করুন',serverAddress:'সার্ভারের ঠিকানা',continue:'চালিয়ে যান',checking:'যাচাই হচ্ছে…',deviceLogin:'এই ডিভাইসে সাইন ইন করুন',syncNow:'এখন সিঙ্ক করুন',signOut:'সংযোগ বিচ্ছিন্ন করুন',noNotes:'এখানে এখনও কোনো নোট নেই',save:'সংরক্ষণ',cancel:'বাতিল',filters:'অনুসন্ধান ফিল্টার',filterHelp:'আপনার দরকারি বিষয়টি খুঁজুন',all:'সব',textNote:'টেক্সট নোট',checklist:'চেকলিস্ট',color:'রং',labels:'লেবেল',reminder:'রিমাইন্ডার',history:'নোটের ইতিহাস',duplicate:'একটি কপি তৈরি করুন',shareLink:'শুধু-পঠন লিঙ্ক শেয়ার করুন',settings:'সেটিংস',theme:'থিম',view:'ভিউ',grid:'গ্রিড',list:'তালিকা',system:'সিস্টেম',light:'হালকা',dark:'গাঢ়',create:'তৈরি করুন',edited:'সম্পাদিত',untitled:'শিরোনামহীন নোট',shared:'শেয়ার করা',administration:'প্রশাসন',export:'রপ্তানি',import:'আমদানি' },
  pt: { connectTitle:'Ligue ao seu Suur',serverAddress:'Endereço do servidor',continue:'Continuar',checking:'A verificar…',deviceLogin:'Entrar neste dispositivo',syncNow:'Sincronizar agora',signOut:'Desligar',noNotes:'Ainda não há notas aqui',save:'Guardar',cancel:'Cancelar',filters:'Filtros de pesquisa',filterHelp:'Encontre exatamente o que precisa',all:'Tudo',textNote:'Nota de texto',checklist:'Lista',color:'Cor',labels:'Marcadores',reminder:'Lembrete',history:'Histórico da nota',duplicate:'Criar uma cópia',shareLink:'Partilhar ligação só de leitura',settings:'Definições',theme:'Tema',view:'Vista',grid:'Grelha',list:'Lista',system:'Sistema',light:'Claro',dark:'Escuro',create:'Criar',edited:'Editado',untitled:'Nota sem título',shared:'Partilhado',administration:'Administração',export:'Exportar',import:'Importar' },
  ru: { connectTitle:'Подключитесь к Suur',serverAddress:'Адрес сервера',continue:'Продолжить',checking:'Проверка…',deviceLogin:'Войти на этом устройстве',syncNow:'Синхронизировать',signOut:'Отключиться',noNotes:'Здесь пока нет заметок',save:'Сохранить',cancel:'Отмена',filters:'Фильтры поиска',filterHelp:'Найдите именно то, что нужно',all:'Все',textNote:'Текстовая заметка',checklist:'Список',color:'Цвет',labels:'Ярлыки',reminder:'Напоминание',history:'История заметки',duplicate:'Создать копию',shareLink:'Поделиться ссылкой только для чтения',settings:'Настройки',theme:'Тема',view:'Вид',grid:'Сетка',list:'Список',system:'Система',light:'Светлая',dark:'Тёмная',create:'Создать',edited:'Изменено',untitled:'Заметка без названия',shared:'Общие',administration:'Администрирование',export:'Экспорт',import:'Импорт' },
};

function interpolate(message: string, values?: Record<string, string | number>) {
  let result = message;
  for (const [key, value] of Object.entries(values || {})) result = result.replaceAll(`{${key}}`, String(value));
  return result;
}

export function mobileLocale(value?: string | null) {
  return normalizeLocale(value || (typeof navigator === 'undefined' ? 'tr' : navigator.language));
}

export function mobileText(locale: Locale, key: MobileCopyKey, values?: Record<string, string | number>) {
  const localized = additionalCopy[locale][key] || copy.en[key];
  return interpolate(localized, values);
}

export function sharedText(locale: Locale, key: Parameters<typeof translate>[1], values?: Record<string, string | number>) {
  return translate(locale, key, values);
}

export function applyDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = languageDirection(locale);
}
