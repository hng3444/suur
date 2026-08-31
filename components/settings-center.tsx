'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Camera, Check, DatabaseBackup, Download, FileArchive, FileJson, FileText, HardDriveDownload, Languages, LogOut, Monitor, Moon, Plus, Shield, Sun, Trash2, Upload, UserRound, Users, X } from 'lucide-react';
import { clearOfflineData } from '@/lib/offline';
import { ConfirmDialog } from '@/components/app-dialogs';
import { languages, translate } from '@/lib/i18n';
import type { AppSettings, User, UserRole } from '@/lib/types';

type SettingsTab = 'appearance' | 'profile' | 'users' | 'data';

interface SettingsCenterProps {
  currentUser: User;
  settings: AppSettings;
  onClose: () => void;
  onSettingsChange: (patch: Partial<AppSettings>) => Promise<void>;
  onUserChange: (user: User) => void;
  onImportComplete: () => void;
  onEditLabels: () => void;
}

export function SettingsCenter({ currentUser, settings, onClose, onSettingsChange, onUserChange, onImportComplete, onEditLabels }: SettingsCenterProps) {
  const router = useRouter();
  const [tab, setTab] = useState<SettingsTab>(currentUser.mustChangePassword ? 'profile' : 'appearance');
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [username, setUsername] = useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({ username: '', displayName: '', password: '', role: 'user' as UserRole, storageQuotaMb: 512 });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState('');
  const [backups, setBackups] = useState<Array<{ name: string; size: number; createdAt: string }>>([]);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const portableInput = useRef<HTMLInputElement>(null);
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.locale, key);
  const ui = (turkish: string, english: string) => settings.locale === 'tr' ? turkish : english;

  const notify = (text: string) => { setMessage(text); window.setTimeout(() => setMessage(''), 3000); };

  useEffect(() => {
    if (tab !== 'users' || currentUser.role !== 'superadmin') return;
    void fetch('/api/users').then(async (response) => {
      if (response.ok) setUsers((await response.json()).users);
    });
  }, [currentUser.role, tab]);

  useEffect(() => {
    if (tab !== 'data') return;
    void fetch('/api/backups').then(async (response) => { if (response.ok) setBackups((await response.json()).backups); });
  }, [tab]);

  const saveProfile = async () => {
    setBusy(true);
    try {
      const body: Record<string, string> = { username, displayName };
      if (newPassword) { body.password = newPassword; body.currentPassword = currentPassword; }
      const response = await fetch(`/api/users/${currentUser.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Profil güncellenemedi.');
      if (data.reauthenticate) { router.replace('/login'); router.refresh(); return; }
      onUserChange(data.user);
      setCurrentPassword(''); setNewPassword('');
      notify('Profil güncellendi.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Profil güncellenemedi.'); }
    finally { setBusy(false); }
  };

  const uploadAvatar = async (file: File) => {
    const form = new FormData(); form.append('file', file);
    setBusy(true);
    try {
      const response = await fetch('/api/users/me/avatar', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Profil görseli yüklenemedi.');
      onUserChange(data.user); notify('Profil görseli güncellendi.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Profil görseli yüklenemedi.'); }
    finally { setBusy(false); }
  };

  const addUser = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Kullanıcı eklenemedi.');
      setUsers((items) => [...items, data.user]);
      setNewUser({ username: '', displayName: '', password: '', role: 'user', storageQuotaMb: 512 }); notify('Kullanıcı eklendi.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Kullanıcı eklenemedi.'); }
    finally { setBusy(false); }
  };

  const changeRole = async (user: User, role: UserRole) => {
    const response = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
    const data = await response.json();
    if (!response.ok) { notify(data.error || 'Rol değiştirilemedi.'); return; }
    setUsers((items) => items.map((item) => item.id === user.id ? data.user : item));
  };

  const changeQuota = async (user: User, storageQuotaMb: number) => {
    const response = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storageQuotaMb }) });
    const data = await response.json();
    if (!response.ok) { notify(data.error || 'Kota değiştirilemedi.'); return; }
    setUsers((items) => items.map((item) => item.id === user.id ? data.user : item));
  };

  const removeUser = async (user: User) => {
    const response = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) { notify(data.error || 'Kullanıcı silinemedi.'); return; }
    setUsers((items) => items.filter((item) => item.id !== user.id));
    setUserToDelete(null);
  };

  const importKeep = async (file: File) => {
    const form = new FormData(); form.append('file', file);
    setBusy(true); setImportResult('İçe aktarılıyor…');
    try {
      const response = await fetch('/api/import/google-keep', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'İçe aktarma başarısız.');
      setImportResult(`${data.imported} not ve ${data.images} görsel aktarıldı. ${data.skipped} öğe atlandı.`);
      onImportComplete();
    } catch (error) { setImportResult(error instanceof Error ? error.message : 'İçe aktarma başarısız.'); }
    finally { setBusy(false); }
  };

  const importPortable = async (file: File) => {
    const form = new FormData(); form.append('file', file);
    setBusy(true); setImportResult('İçe aktarılıyor…');
    try {
      const response = await fetch('/api/import/portable', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'İçe aktarma başarısız.');
      setImportResult(`${data.imported} not ve ${data.attachments || 0} dosya içe aktarıldı.`);
      onImportComplete();
    } catch (error) { setImportResult(error instanceof Error ? error.message : 'İçe aktarma başarısız.'); }
    finally { setBusy(false); }
  };

  const createServerBackup = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/backups', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Yedek oluşturulamadı.');
      const list = await fetch('/api/backups');
      if (list.ok) setBackups((await list.json()).backups);
      notify('Sunucu yedeği oluşturuldu.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Yedek oluşturulamadı.'); }
    finally { setBusy(false); }
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    if ('serviceWorker' in navigator) {
      await Promise.race([
        navigator.serviceWorker.ready.then((registration) => new Promise<void>((resolve) => {
          if (!registration.active) { resolve(); return; }
          const channel = new MessageChannel();
          channel.port1.onmessage = () => resolve();
          registration.active.postMessage({ type: 'CLEAR_PRIVATE' }, [channel.port2]);
        })),
        new Promise<void>((resolve) => window.setTimeout(resolve, 1_500)),
      ]);
    }
    await clearOfflineData().catch(() => undefined);
    router.replace('/login');
    router.refresh();
  };

  const toggleNotifications = async () => {
    if (!('Notification' in window)) { notify('Bu tarayıcı bildirimleri desteklemiyor.'); return; }
    if (!settings.notificationsEnabled) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { notify('Bildirim izni verilmedi.'); return; }
    }
    await onSettingsChange({ notificationsEnabled: !settings.notificationsEnabled });
    notify(!settings.notificationsEnabled ? 'Hatırlatıcı bildirimleri açıldı.' : 'Hatırlatıcı bildirimleri kapatıldı.');
  };

  const avatar = (user: User, large = false) => user.avatarUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={large ? 'settings-avatar large' : 'settings-avatar'} src={user.avatarUrl} alt="" />
    : <span className={large ? 'settings-avatar large fallback' : 'settings-avatar fallback'}>{(user.displayName || user.username).slice(0, 1).toLocaleUpperCase('tr')}</span>;

  return (
    <div className="dialog-backdrop settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !currentUser.mustChangePassword) onClose(); }}>
      <section className="settings-center" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header"><div><span className="editor-kicker">SUUR</span><h2 id="settings-title">{ui('Ayarlar', 'Settings')}</h2></div>{!currentUser.mustChangePassword && <button className="toolbar-button" onClick={onClose} aria-label={ui('Ayarları kapat', 'Close settings')}><X size={20} /></button>}</header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label={ui('Ayar kategorileri', 'Settings categories')}>
            {!currentUser.mustChangePassword && <button className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}><Monitor size={18} /><span>{ui('Görünüm', 'Appearance')}</span></button>}
            <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}><UserRound size={18} /><span>{ui('Profil', 'Profile')}</span></button>
            {!currentUser.mustChangePassword && currentUser.role === 'superadmin' && <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={18} /><span>{ui('Kullanıcılar', 'Users')}</span></button>}
            {!currentUser.mustChangePassword && <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}><DatabaseBackup size={18} /><span>{ui('Veri ve yedek', 'Data & backup')}</span></button>}
            {!currentUser.mustChangePassword && <button onClick={() => { onClose(); onEditLabels(); }}><Shield size={18} /><span>{ui('Etiketler', 'Labels')}</span></button>}
            <button className="logout-nav" onClick={() => void signOut()}><LogOut size={18} /><span>{ui('Çıkış yap', 'Sign out')}</span></button>
          </nav>

          <div className="settings-content">
            {tab === 'appearance' && <section className="settings-panel"><h3>{ui('Görünüm', 'Appearance')}</h3><p>{ui('Temayı ve not düzenini seç.', 'Choose the theme and note layout.')}</p>
              <div className="theme-options">
                {([{ value: 'light', label: ui('Açık', 'Light'), icon: Sun }, { value: 'dark', label: ui('Karanlık', 'Dark'), icon: Moon }, { value: 'system', label: ui('Sistem', 'System'), icon: Monitor }] as const).map((item) => <button className={settings.theme === item.value ? 'selected' : ''} key={item.value} onClick={() => void onSettingsChange({ theme: item.value })}><item.icon size={21} /><span>{item.label}</span>{settings.theme === item.value && <Check size={15} />}</button>)}
              </div>
              <div className="setting-row"><div><strong>{ui('Not düzeni', 'Note layout')}</strong><span>{ui('Grid veya tek sütun liste', 'Grid or single-column list')}</span></div><select value={settings.view} onChange={(event) => void onSettingsChange({ view: event.target.value as 'grid' | 'list' })}><option value="grid">Grid</option><option value="list">{ui('Liste', 'List')}</option></select></div>
              <div className="setting-row"><div><strong><Languages size={16} /> {t('settings.language')}</strong><span>{t('settings.languageHelp')}</span></div><select value={settings.locale} onChange={(event) => void onSettingsChange({ locale: event.target.value as AppSettings['locale'] })}>{languages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}</select></div>
              <div className="setting-row accent-setting"><div><strong>{ui('Vurgu rengi', 'Accent color')}</strong><span>{ui('Düğmeler ve seçili alanlar', 'Buttons and selected areas')}</span></div><div className="accent-options">{(['forest', 'emerald', 'teal', 'blue', 'violet', 'amber'] as const).map((accent) => <button key={accent} className={`accent-${accent} ${settings.accent === accent ? 'selected' : ''}`} onClick={() => void onSettingsChange({ accent })} aria-label={accent}>{settings.accent === accent && <Check size={13} />}</button>)}</div></div>
              <div className="setting-row"><div><strong><BellRing size={16} /> {ui('Tarayıcı bildirimleri', 'Browser notifications')}</strong><span>{ui('Hatırlatıcı zamanı geldiğinde haber ver', 'Notify when a reminder is due')}</span></div><button className={`toggle-switch ${settings.notificationsEnabled ? 'selected' : ''}`} role="switch" aria-checked={settings.notificationsEnabled} onClick={() => void toggleNotifications()}><span /></button></div>
              <div className="setting-row"><div><strong>{ui('Tamamlanan checklist öğeleri', 'Completed checklist items')}</strong><span>{ui('Tamamlanınca otomatik olarak alta taşı', 'Move completed items to the bottom')}</span></div><button className={`toggle-switch ${settings.completedItemsBottom ? 'selected' : ''}`} role="switch" aria-checked={settings.completedItemsBottom} onClick={() => void onSettingsChange({ completedItemsBottom: !settings.completedItemsBottom })}><span /></button></div>
            </section>}

            {tab === 'profile' && <section className="settings-panel"><h3>{ui('Profil', 'Profile')}</h3><p>{ui('Hesap ve profil bilgilerini yönet.', 'Manage account and profile information.')}</p>
              {currentUser.mustChangePassword && <div className="password-required"><Shield size={19} /><div><strong>{ui('Varsayılan şifreyi değiştirin', 'Change the default password')}</strong><span>{ui('Devam etmek için mevcut şifreyi ve yeni, size özel bir şifreyi girin.', 'Enter the current password and a new private password to continue.')}</span></div></div>}
              <div className="profile-photo-row">{avatar(currentUser, true)}<div><strong>{currentUser.displayName}</strong><span>{currentUser.role}</span><button onClick={() => avatarInput.current?.click()}><Camera size={16} /> {ui('Fotoğraf değiştir', 'Change photo')}</button><input ref={avatarInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.target.value = ''; }} /></div></div>
              <div className="settings-form"><label>{ui('Görünen ad', 'Display name')}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>{ui('Kullanıcı adı', 'Username')}<input value={username} onChange={(event) => setUsername(event.target.value)} /></label><div className="form-divider" /><label>{ui('Mevcut şifre', 'Current password')}<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label><label>{ui('Yeni şifre', 'New password')}<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={7} autoComplete="new-password" placeholder={ui('Değiştirmeyeceksen boş bırak', 'Leave blank to keep it unchanged')} /></label><button className="primary-settings-button" onClick={() => void saveProfile()} disabled={busy}>{ui('Değişiklikleri kaydet', 'Save changes')}</button></div>
            </section>}

            {tab === 'users' && currentUser.role === 'superadmin' && <section className="settings-panel"><h3>{ui('Kullanıcılar', 'Users')}</h3><p>{ui('Bu Suur sunucusuna yeni kullanıcılar ekle.', 'Add users to this Suur server.')}</p>
              <div className="new-user-card"><input placeholder={ui('Kullanıcı adı', 'Username')} value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} /><input placeholder={ui('Görünen ad', 'Display name')} value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} /><input placeholder={ui('Geçici şifre', 'Temporary password')} type="password" minLength={7} value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /><select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as UserRole })}><option value="user">{ui('Kullanıcı', 'User')}</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select><label className="quota-input">{ui('Kota', 'Quota')} (MB)<input type="number" min={50} max={102400} value={newUser.storageQuotaMb} onChange={(event) => setNewUser({ ...newUser, storageQuotaMb: Number(event.target.value) })} /></label><button onClick={() => void addUser()} disabled={busy || !newUser.username || !newUser.password || !newUser.displayName}><Plus size={17} /> {ui('Ekle', 'Add')}</button></div>
              <div className="user-list">{users.map((user) => <div key={user.id}>{avatar(user)}<div><strong>{user.displayName}</strong><span>@{user.username}</span></div><select value={user.role} disabled={user.id === currentUser.id} onChange={(event) => void changeRole(user, event.target.value as UserRole)}><option value="user">{ui('Kullanıcı', 'User')}</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select><label className="user-quota"><input aria-label={`${user.username} ${ui('depolama kotası', 'storage quota')}`} type="number" min={50} max={102400} defaultValue={user.storageQuotaMb} onBlur={(event) => void changeQuota(user, Number(event.target.value))} /> MB</label>{user.id !== currentUser.id && <button className="danger-icon" onClick={() => setUserToDelete(user)} aria-label={`${ui('Kullanıcıyı sil', 'Delete user')}: ${user.username}`}><Trash2 size={16} /></button>}</div>)}</div>
            </section>}

            {tab === 'data' && <section className="settings-panel"><h3>{ui('Veri ve yedek', 'Data & backup')}</h3><p>{ui('Notlarını dışa aktar, otomatik yedeklemeyi yönet veya başka bir kaynaktan geri yükle.', 'Export notes, manage automatic backups, or restore from another source.')}</p>
              <h4 className="settings-section-title">{ui('Dışa aktar ve indir', 'Export & download')}</h4>
              <div className="data-action-grid"><a href="/api/export?format=backup"><FileArchive size={19} /><span><strong>{ui('Tam yedek', 'Full backup')}</strong><small>{ui('Notlar, ayarlar ve dosyalar', 'Notes, settings, and files')}</small></span></a><a href="/api/export?format=json"><FileJson size={19} /><span><strong>JSON</strong><small>{ui('Taşınabilir yapılandırılmış veri', 'Portable structured data')}</small></span></a><a href="/api/export?format=markdown"><FileText size={19} /><span><strong>Markdown</strong><small>{ui('Her not ayrı bir .md dosyası', 'Each note as a separate .md file')}</small></span></a><a href="/api/export?format=txt"><FileText size={19} /><span><strong>TXT</strong><small>{ui('Düz metin arşivi', 'Plain-text archive')}</small></span></a></div>
              <h4 className="settings-section-title">{ui('Sunucu yedekleri', 'Server backups')}</h4>
              <div className="setting-row"><div><strong>{ui('Otomatik yedekleme', 'Automatic backup')}</strong><span>{ui('Uygulama kapalı olsa da sunucuda günlük veya haftalık çalışır', 'Runs daily or weekly on the server, even while the app is closed')}</span></div><select value={settings.backupFrequency} onChange={(event) => void onSettingsChange({ backupFrequency: event.target.value as AppSettings['backupFrequency'] })}><option value="off">{ui('Kapalı', 'Off')}</option><option value="daily">{ui('Her gün', 'Daily')}</option><option value="weekly">{ui('Her hafta', 'Weekly')}</option></select></div>
              <div className="setting-row"><div><strong>{ui('Çöpü otomatik temizle', 'Automatically empty trash')}</strong><span>{ui('Silinen notların saklanacağı gün', 'Days to retain deleted notes')}</span></div><select value={settings.trashRetentionDays} onChange={(event) => void onSettingsChange({ trashRetentionDays: Number(event.target.value) })}>{[7, 14, 30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days} {ui('gün', 'days')}</option>)}</select></div>
              <button className="wide-data-button" onClick={() => void createServerBackup()} disabled={busy}><HardDriveDownload size={18} /> {ui('Şimdi sunucu yedeği oluştur', 'Create server backup now')}</button>
              {backups.length > 0 && <div className="backup-list">{backups.map((backup) => <a key={backup.name} href={`/api/backups/${encodeURIComponent(backup.name)}`}><span>{new Date(backup.createdAt).toLocaleString(settings.locale)}</span><small>{(backup.size / 1024 / 1024).toFixed(1)} MB</small><Download size={15} /></a>)}</div>}
              <h4 className="settings-section-title">{ui('İçe aktar', 'Import')}</h4>
              <p className="import-explanation">{ui('İçe aktarma mevcut notları silmez; güvenli biçimde yeni kopyalar oluşturur.', 'Import never deletes existing notes; it safely creates new copies.')}</p>
              <div className="import-choice-grid"><button onClick={() => portableInput.current?.click()} disabled={busy}><FileArchive size={22} /><strong>Suur / JSON / Markdown</strong><span>{ui('Yedek ZIP, JSON veya .md dosyası', 'Backup ZIP, JSON, or .md file')}</span></button><button onClick={() => importInput.current?.click()} disabled={busy}><Upload size={22} /><strong>Google Keep</strong><span>{ui('Google Takeout ZIP veya JSON', 'Google Takeout ZIP or JSON')}</span></button></div>
              <input ref={portableInput} hidden type="file" accept=".zip,.json,.md,.markdown,application/zip,application/json,text/markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importPortable(file); event.target.value = ''; }} />
              <input ref={importInput} hidden type="file" accept=".zip,.json,application/zip,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importKeep(file); event.target.value = ''; }} />
              {importResult && <p className="import-result" role="status">{importResult}</p>}
            </section>}
          </div>
        </div>
        {userToDelete && <ConfirmDialog locale={settings.locale} title={ui('Kullanıcıyı sil', 'Delete user')} message={ui(`${userToDelete.username} kullanıcısı, notları ve yüklediği dosyalar kalıcı olarak silinecek.`, `${userToDelete.username}, their notes, and uploaded files will be deleted permanently.`)} destructive onCancel={() => setUserToDelete(null)} onConfirm={() => void removeUser(userToDelete)} />}
        {message && <div className="settings-message" role="status">{message}</div>}
      </section>
    </div>
  );
}
