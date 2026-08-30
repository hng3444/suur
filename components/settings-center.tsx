'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, Download, LogOut, Monitor, Moon, Plus, Shield, Sun, Trash2, Upload, UserRound, Users, X } from 'lucide-react';
import type { AppSettings, User, UserRole } from '@/lib/types';

type SettingsTab = 'appearance' | 'profile' | 'users' | 'import';

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
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [username, setUsername] = useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({ username: '', displayName: '', password: '', role: 'user' as UserRole });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const notify = (text: string) => { setMessage(text); window.setTimeout(() => setMessage(''), 3000); };

  useEffect(() => {
    if (tab !== 'users' || currentUser.role !== 'superadmin') return;
    void fetch('/api/users').then(async (response) => {
      if (response.ok) setUsers((await response.json()).users);
    });
  }, [currentUser.role, tab]);

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
      setNewUser({ username: '', displayName: '', password: '', role: 'user' }); notify('Kullanıcı eklendi.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Kullanıcı eklenemedi.'); }
    finally { setBusy(false); }
  };

  const changeRole = async (user: User, role: UserRole) => {
    const response = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
    const data = await response.json();
    if (!response.ok) { notify(data.error || 'Rol değiştirilemedi.'); return; }
    setUsers((items) => items.map((item) => item.id === user.id ? data.user : item));
  };

  const removeUser = async (user: User) => {
    if (!window.confirm(`${user.username} kullanıcısı ve tüm notları silinsin mi?`)) return;
    const response = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) { notify(data.error || 'Kullanıcı silinemedi.'); return; }
    setUsers((items) => items.filter((item) => item.id !== user.id));
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

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  const avatar = (user: User, large = false) => user.avatarUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={large ? 'settings-avatar large' : 'settings-avatar'} src={user.avatarUrl} alt="" />
    : <span className={large ? 'settings-avatar large fallback' : 'settings-avatar fallback'}>{(user.displayName || user.username).slice(0, 1).toLocaleUpperCase('tr')}</span>;

  return (
    <div className="dialog-backdrop settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-center" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header"><div><span className="editor-kicker">SUUR</span><h2 id="settings-title">Ayarlar</h2></div><button className="toolbar-button" onClick={onClose} aria-label="Ayarları kapat"><X size={20} /></button></header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Ayar kategorileri">
            <button className={tab === 'appearance' ? 'active' : ''} onClick={() => setTab('appearance')}><Monitor size={18} /><span>Görünüm</span></button>
            <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}><UserRound size={18} /><span>Profil</span></button>
            {currentUser.role === 'superadmin' && <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={18} /><span>Kullanıcılar</span></button>}
            <button className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}><Download size={18} /><span>İçe aktar</span></button>
            <button onClick={() => { onClose(); onEditLabels(); }}><Shield size={18} /><span>Etiketler</span></button>
            <button className="logout-nav" onClick={() => void signOut()}><LogOut size={18} /><span>Çıkış yap</span></button>
          </nav>

          <div className="settings-content">
            {tab === 'appearance' && <section className="settings-panel"><h3>Görünüm</h3><p>Temayı ve not düzenini seç.</p>
              <div className="theme-options">
                {([{ value: 'light', label: 'Açık', icon: Sun }, { value: 'dark', label: 'Karanlık', icon: Moon }, { value: 'system', label: 'Sistem', icon: Monitor }] as const).map((item) => <button className={settings.theme === item.value ? 'selected' : ''} key={item.value} onClick={() => void onSettingsChange({ theme: item.value })}><item.icon size={21} /><span>{item.label}</span>{settings.theme === item.value && <Check size={15} />}</button>)}
              </div>
              <div className="setting-row"><div><strong>Not düzeni</strong><span>Grid veya tek sütun liste</span></div><select value={settings.view} onChange={(event) => void onSettingsChange({ view: event.target.value as 'grid' | 'list' })}><option value="grid">Grid</option><option value="list">Liste</option></select></div>
            </section>}

            {tab === 'profile' && <section className="settings-panel"><h3>Profil</h3><p>Hesap ve profil bilgilerini yönet.</p>
              <div className="profile-photo-row">{avatar(currentUser, true)}<div><strong>{currentUser.displayName}</strong><span>{currentUser.role}</span><button onClick={() => avatarInput.current?.click()}><Camera size={16} /> Fotoğraf değiştir</button><input ref={avatarInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.target.value = ''; }} /></div></div>
              <div className="settings-form"><label>Görünen ad<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Kullanıcı adı<input value={username} onChange={(event) => setUsername(event.target.value)} /></label><div className="form-divider" /><label>Mevcut şifre<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label><label>Yeni şifre<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={7} autoComplete="new-password" placeholder="Değiştirmeyeceksen boş bırak" /></label><button className="primary-settings-button" onClick={() => void saveProfile()} disabled={busy}>Değişiklikleri kaydet</button></div>
            </section>}

            {tab === 'users' && currentUser.role === 'superadmin' && <section className="settings-panel"><h3>Kullanıcılar</h3><p>Bu Suur sunucusuna yeni kullanıcılar ekle.</p>
              <div className="new-user-card"><input placeholder="Kullanıcı adı" value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} /><input placeholder="Görünen ad" value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} /><input placeholder="Geçici şifre" type="password" minLength={7} value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /><select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as UserRole })}><option value="user">Kullanıcı</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select><button onClick={() => void addUser()} disabled={busy || !newUser.username || !newUser.password || !newUser.displayName}><Plus size={17} /> Ekle</button></div>
              <div className="user-list">{users.map((user) => <div key={user.id}>{avatar(user)}<div><strong>{user.displayName}</strong><span>@{user.username}</span></div><select value={user.role} disabled={user.id === currentUser.id} onChange={(event) => void changeRole(user, event.target.value as UserRole)}><option value="user">Kullanıcı</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select>{user.id !== currentUser.id && <button className="danger-icon" onClick={() => void removeUser(user)} aria-label={`${user.username} kullanıcısını sil`}><Trash2 size={16} /></button>}</div>)}</div>
            </section>}

            {tab === 'import' && <section className="settings-panel"><h3>Google Keep’ten içe aktar</h3><p>Google Takeout’tan indirdiğin Keep ZIP dosyasını veya tekil JSON notlarını seç. Notlar, checklist’ler, etiketler, renkler ve arşivdeki görseller korunur.</p><div className="import-drop"><Upload size={30} /><strong>Takeout dosyanı seç</strong><span>ZIP veya JSON · En fazla 100 MB</span><button onClick={() => importInput.current?.click()} disabled={busy}>Dosya seç</button><input ref={importInput} hidden type="file" accept=".zip,.json,application/zip,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importKeep(file); event.target.value = ''; }} /></div>{importResult && <p className="import-result" role="status">{importResult}</p>}</section>}
          </div>
        </div>
        {message && <div className="settings-message" role="status">{message}</div>}
      </section>
    </div>
  );
}
