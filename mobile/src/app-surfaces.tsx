import { useBackLayer } from './use-back-layer.ts';
import {
  Archive,
  AppWindow,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  DatabaseBackup,
  Download,
  FileArchive,
  FileJson,
  FileText,
  Info,
  LayoutGrid,
  Lightbulb,
  LoaderCircle,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Rows3,
  Settings,
  Shield,
  SlidersHorizontal,
  Sun,
  Tag,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import packageJson from '../../package.json';
import { languages } from '../../lib/i18n.ts';
import type { AppSettings, BrandingSettings, Label, Locale, Note, NoteColor, NoteView, User } from '../../lib/types.ts';
import {
  backupResponse,
  createRemoteBackup,
  createRemoteUser,
  deleteRemoteUser,
  exportResponse,
  getRemoteBranding,
  importRemoteFile,
  listRemoteBackups,
  listRemoteUsers,
  resetRemoteBrandingIcon,
  updateProfile,
  updateRemoteBranding,
  updateRemoteUser,
  uploadRemoteBrandingIcon,
  uploadProfileAvatar,
  type BackupEntry,
} from './mobile-api.ts';
import { MobileAvatar } from './mobile-media.tsx';
import { saveOrShareBlob } from './native-capabilities.ts';
import type { StoredMobileSession } from './secure-session.ts';
import { mobileText, sharedText } from './mobile-i18n.ts';

export type MobileDestination = NoteView | 'labels' | 'settings';
export type MobileSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'pending' | 'auth' | 'blocked';

export interface MobileFilters {
  type: 'all' | 'text' | 'checklist';
  color: 'all' | NoteColor;
  label: 'all' | string;
  reminder: 'all' | 'yes' | 'no';
  date: 'all' | 'today' | 'week' | 'month';
}

export const emptyMobileFilters: MobileFilters = { type: 'all', color: 'all', label: 'all', reminder: 'all', date: 'all' };
const noteColors: NoteColor[] = ['default', 'mint', 'sage', 'sand', 'rose', 'sky', 'lavender'];

export function AppDrawer({ open, destination, activeLabel, labels, session, status, pending, locale, onNavigate, onClose, onSync }: {
  open: boolean;
  destination: MobileDestination;
  activeLabel: string;
  labels: Label[];
  session: StoredMobileSession;
  status: MobileSyncStatus;
  pending: number;
  locale: Locale;
  onNavigate: (destination: MobileDestination, label?: string) => void;
  onClose: () => void;
  onSync: () => void;
}) {
  const items: Array<{ id: NoteView; icon: typeof Lightbulb; label: Parameters<typeof sharedText>[1] }> = [
    { id: 'notes', icon: Lightbulb, label: 'nav.notes' },
    { id: 'reminders', icon: Bell, label: 'nav.reminders' },
    { id: 'calendar', icon: CalendarDays, label: 'nav.calendar' },
    { id: 'shared', icon: Users, label: 'nav.shared' },
    { id: 'archive', icon: Archive, label: 'nav.archive' },
    { id: 'trash', icon: Trash2, label: 'nav.trash' },
  ];
  const StatusIcon = status === 'offline' ? CloudOff : status === 'syncing' ? RefreshCw : Cloud;
  return <div className={`drawer-layer ${open ? 'open' : ''}`} aria-hidden={!open} onClick={onClose}><aside className="app-drawer" onClick={(event) => event.stopPropagation()}>
    <header><img src="/suuricon.png" alt="" /><div><strong>{session.serverName}</strong><small>{session.serverUrl.replace(/^https?:\/\//, '')}</small></div><button onClick={onClose}><X /></button></header>
    <nav>{items.slice(0, 4).map((item) => { const Icon = item.icon; return <button key={item.id} className={destination === item.id && !activeLabel ? 'active' : ''} onClick={() => onNavigate(item.id)}><Icon />{sharedText(locale, item.label)}</button>; })}</nav>
    <div className="drawer-heading"><span>{sharedText(locale, 'nav.labels')}</span><button onClick={() => onNavigate('labels')}><Plus /></button></div>
    <nav className="drawer-labels">{labels.map((label) => <button key={label.id} className={activeLabel === label.id ? 'active' : ''} onClick={() => onNavigate('notes', label.id)}><i style={{ background: label.color }} />{label.name}</button>)}{!labels.length && <small>{mobileText(locale, 'noLabels')}</small>}</nav>
    <nav className="drawer-secondary">{items.slice(4).map((item) => { const Icon = item.icon; return <button key={item.id} className={destination === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)}><Icon />{sharedText(locale, item.label)}</button>; })}<button className={destination === 'settings' ? 'active' : ''} onClick={() => onNavigate('settings')}><Settings />{sharedText(locale, 'nav.settings')}</button></nav>
    <footer><button onClick={onSync} disabled={status === 'syncing'}><StatusIcon className={status === 'syncing' ? 'spin' : ''} /><span>{status === 'offline' ? sharedText(locale, 'status.offline') : status === 'syncing' ? sharedText(locale, 'status.syncing') : pending ? mobileText(locale, 'pending', { count: pending }) : sharedText(locale, 'status.synced')}</span></button><div><MobileAvatar session={session} /><span><strong>{session.user.displayName}</strong><small>@{session.user.username}</small></span></div></footer>
  </aside></div>;
}

export function SearchSurface({ locale, query, filters, labels, onQuery, onFilters, onClose }: {
  locale: Locale;
  query: string;
  filters: MobileFilters;
  labels: Label[];
  onQuery: (query: string) => void;
  onFilters: (filters: MobileFilters) => void;
  onClose: () => void;
}) {
  const active = Object.values(filters).filter((value) => value !== 'all').length;
  return <section className="search-surface">
    <header><button onClick={onClose}><ArrowLeft /></button><input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} placeholder={sharedText(locale, 'search')} /><button onClick={() => { onQuery(''); onFilters(emptyMobileFilters); }}><X /></button></header>
    <main>
      <div className="search-hint"><SlidersHorizontal /><div><strong>{mobileText(locale, 'filters')}</strong><span>{active ? mobileText(locale, 'activeFilters', { count: active }) : mobileText(locale, 'filterHelp')}</span></div></div>
      <section><h2>{mobileText(locale, 'noteType')}</h2><div className="filter-pills"><button className={filters.type === 'all' ? 'selected' : ''} onClick={() => onFilters({ ...filters, type: 'all' })}>{mobileText(locale, 'all')}</button><button className={filters.type === 'text' ? 'selected' : ''} onClick={() => onFilters({ ...filters, type: 'text' })}><FileText />{mobileText(locale, 'textNote')}</button><button className={filters.type === 'checklist' ? 'selected' : ''} onClick={() => onFilters({ ...filters, type: 'checklist' })}><Check />{mobileText(locale, 'checklist')}</button></div></section>
      <section><h2>{mobileText(locale, 'color')}</h2><div className="filter-colors"><button className={`color-choice color-all ${filters.color === 'all' ? 'selected' : ''}`} onClick={() => onFilters({ ...filters, color: 'all' })}>{filters.color === 'all' && <Check />}</button>{noteColors.map((color) => <button key={color} className={`color-choice note-color-${color} ${filters.color === color ? 'selected' : ''}`} onClick={() => onFilters({ ...filters, color })}>{filters.color === color && <Check />}</button>)}</div></section>
      <section><h2>{mobileText(locale, 'labels')}</h2><div className="filter-pills wrap"><button className={filters.label === 'all' ? 'selected' : ''} onClick={() => onFilters({ ...filters, label: 'all' })}>{mobileText(locale, 'all')}</button>{labels.map((label) => <button key={label.id} className={filters.label === label.id ? 'selected' : ''} onClick={() => onFilters({ ...filters, label: label.id })}><i style={{ background: label.color }} />{label.name}</button>)}</div></section>
      <section className="filter-two"><div><h2>{mobileText(locale, 'reminder')}</h2><select value={filters.reminder} onChange={(event) => onFilters({ ...filters, reminder: event.target.value as MobileFilters['reminder'] })}><option value="all">{mobileText(locale, 'all')}</option><option value="yes">{mobileText(locale, 'withReminder')}</option><option value="no">{mobileText(locale, 'withoutReminder')}</option></select></div><div><h2>{mobileText(locale, 'updated')}</h2><select value={filters.date} onChange={(event) => onFilters({ ...filters, date: event.target.value as MobileFilters['date'] })}><option value="all">{mobileText(locale, 'allTime')}</option><option value="today">{mobileText(locale, 'today')}</option><option value="week">{mobileText(locale, 'week')}</option><option value="month">{mobileText(locale, 'month')}</option></select></div></section>
    </main>
  </section>;
}

export function LabelsSurface({ labels, locale, onBack, onCreate, onUpdate, onDelete }: {
  labels: Label[];
  locale: Locale;
  onBack: () => void;
  onCreate: (name: string, color: string) => Promise<void>;
  onUpdate: (label: Label) => Promise<void>;
  onDelete: (label: Label) => Promise<void>;
}) {
  const palette = ['#f05a24', '#1677a3', '#7656a8', '#d0a419', '#b5485a', '#6f746f'];
  const [name, setName] = useState('');
  const [color, setColor] = useState(palette[0]);
  return <section className="standalone-surface"><header><button onClick={onBack}><ArrowLeft /></button><h1>{sharedText(locale, 'nav.labels')}</h1></header><main className="labels-manager"><form onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; void onCreate(name, color).then(() => setName('')); }}><input value={name} onChange={(event) => setName(event.target.value)} placeholder={sharedText(locale, 'labels.new')} maxLength={80} /><div>{palette.map((item) => <button type="button" key={item} className={color === item ? 'selected' : ''} style={{ background: item }} onClick={() => setColor(item)}>{color === item && <Check />}</button>)}</div><button className="primary-small"><Plus />{mobileText(locale, 'create')}</button></form><div className="label-rows">{labels.map((label) => <div key={label.id}><input type="color" value={label.color} onChange={(event) => void onUpdate({ ...label, color: event.target.value })} /><input value={label.name} onChange={(event) => void onUpdate({ ...label, name: event.target.value })} /><button className="danger" onClick={() => void onDelete(label)}><Trash2 /></button></div>)}{!labels.length && <p><Tag />{mobileText(locale, 'noLabels')}</p>}</div></main></section>;
}

export function CalendarSurface({ notes, locale, onOpen }: { notes: Note[]; locale: Locale; onOpen: (note: Note) => void }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const groups = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const note of notes) {
      if (!note.reminderAt || note.archived || note.trashedAt) continue;
      const date = new Date(note.reminderAt);
      if (date.getFullYear() !== month.getFullYear() || date.getMonth() !== month.getMonth()) continue;
      const key = date.toISOString().slice(0, 10);
      map.set(key, [...(map.get(key) || []), note]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [month, notes]);
  return <section className="mobile-calendar"><header><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button><h2>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month)}</h2><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button></header><main>{groups.length ? groups.map(([day, items]) => <section key={day}><time>{new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00`))}</time>{items.map((note) => <button className={`note-color-${note.color}`} key={note.id} onClick={() => onOpen(note)}><span>{new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(note.reminderAt!))}</span><strong>{note.title || mobileText(locale, 'untitled')}</strong><Bell /></button>)}</section>) : <div className="surface-empty"><CalendarDays /><strong>{mobileText(locale, 'noRemindersMonth')}</strong></div>}</main></section>;
}

type SettingsTab = 'notifications' | 'appearance' | 'profile' | 'data' | 'advanced' | 'admin' | 'about';

export function MobileSettings({ settings, locale, session, onBack, onSettings, onSession, onSync, onSignOut }: {
  settings: AppSettings;
  locale: Locale;
  session: StoredMobileSession;
  onBack: () => void;
  onSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onSession: (session: StoredMobileSession) => Promise<void>;
  onSync: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [tab, setTab] = useState<SettingsTab | null>(null);
  useBackLayer(tab !== null, 10, () => setTab(null));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState(session.user.displayName);
  const [username, setUsername] = useState(session.user.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [appName, setAppName] = useState(session.serverName);
  const [branding, setBranding] = useState<BrandingSettings>({ appName: session.serverName, hasCustomIcon: false, iconVersion: '' });
  const [newUser, setNewUser] = useState({ username: '', displayName: '', password: '', role: 'user', storageQuotaMb: 512 });
  const avatarInput = useRef<HTMLInputElement>(null);
  const portableInput = useRef<HTMLInputElement>(null);
  const keepInput = useRef<HTMLInputElement>(null);
  const brandingIconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab !== 'data') return;
    void listRemoteBackups(session).then(setBackups).catch(() => undefined);
  }, [session, tab]);
  useEffect(() => {
    if (tab !== 'admin' || session.user.role !== 'superadmin') return;
    void Promise.all([listRemoteUsers(session), getRemoteBranding(session)]).then(([list, nextBranding]) => { setUsers(list); setBranding(nextBranding); setAppName(nextBranding.appName); }).catch(() => undefined);
  }, [session, tab]);

  const run = async (task: () => Promise<void>, success: string) => {
    setBusy(true); setMessage('');
    try { await task(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : mobileText(locale, 'failed')); } finally { setBusy(false); }
  };
  const saveProfile = () => run(async () => {
    const result = await updateProfile(session, { username, displayName, ...(password ? { password, currentPassword } : {}) });
    if (result.reauthenticate) { await onSignOut(); return; }
    await onSession({ ...session, user: result.user });
    setPassword(''); setCurrentPassword('');
  }, mobileText(locale, 'profileSaved'));
  const uploadAvatar = (file: File) => run(async () => { const user = await uploadProfileAvatar(session, file); await onSession({ ...session, user }); }, mobileText(locale, 'profileSaved'));
  const exportFile = (format: 'backup' | 'json' | 'markdown' | 'txt') => run(async () => {
    const response = await exportResponse(session, format);
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const disposition = response.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `suur-${format}-${new Date().toISOString().slice(0, 10)}.${format === 'json' ? 'json' : 'zip'}`;
    await saveOrShareBlob(await response.blob(), filename, 'Suur');
  }, mobileText(locale, 'exportReady'));
  const downloadServerBackup = (backup: BackupEntry) => run(async () => {
    const response = await backupResponse(session, backup.name);
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    await saveOrShareBlob(await response.blob(), backup.name, backup.name);
  }, mobileText(locale, 'exportReady'));
  const importFile = (file: File, kind: 'portable' | 'keep') => run(async () => { await importRemoteFile(session, file, kind); await onSync(); }, mobileText(locale, 'importComplete'));
  const tabs: Array<{ id: SettingsTab; icon: typeof Palette; label: string; hidden?: boolean }> = [
    { id: 'appearance', icon: Palette, label: sharedText(locale, 'settings.appearance') },
    { id: 'profile', icon: UserRound, label: sharedText(locale, 'settings.profile') },
    { id: 'notifications', icon: Bell, label: mobileText(locale, 'notifications') },
    { id: 'data', icon: DatabaseBackup, label: sharedText(locale, 'settings.data') },
    { id: 'advanced', icon: SlidersHorizontal, label: sharedText(locale, 'settings.advanced') },
    { id: 'admin', icon: Shield, label: mobileText(locale, 'administration'), hidden: session.user.role !== 'superadmin' },
    { id: 'about', icon: Info, label: sharedText(locale, 'settings.about') },
  ];
  return <section className={`settings-screen ${tab ? 'settings-detail' : 'settings-overview'}`}><header><button onClick={() => tab ? setTab(null) : onBack()} aria-label={sharedText(locale, 'close')}><ArrowLeft /></button><h1>{tab ? tabs.find((item) => item.id === tab)?.label : sharedText(locale, 'nav.settings')}</h1></header><main>
    {!tab && <div className="settings-home">
      <button className="settings-account-row" onClick={() => setTab('profile')}><MobileAvatar session={session} size="large" /><span><strong>{session.user.displayName}</strong><small>@{session.user.username}</small></span><ChevronRight /></button>
      <nav aria-label={sharedText(locale, 'nav.settings')}>{tabs.filter((item) => !item.hidden && item.id !== 'profile').map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)}><span className="settings-category-icon"><Icon /></span><strong>{item.label}</strong><ChevronRight /></button>; })}</nav>
      <div className="settings-server-caption">{session.serverName}<span>{session.serverUrl}</span></div>
      <button className="settings-logout-row" onClick={() => void onSignOut()}><LogOut />{sharedText(locale, 'settings.signOut')}</button>
    </div>}
    {message && <button className="settings-message" onClick={() => setMessage('')}>{busy && <LoaderCircle className="spin" />}{message}<X /></button>}
    {tab === 'appearance' && <div className="settings-section"><div className="section-title"><Palette /><div><h2>{sharedText(locale, 'settings.appearance')}</h2><p>{mobileText(locale, 'appearanceHelp')}</p></div></div><label><span>{mobileText(locale, 'theme')}</span><div className="settings-segments"><button className={settings.theme === 'system' ? 'active' : ''} onClick={() => void onSettings({ theme: 'system' })}><Monitor />{mobileText(locale, 'system')}</button><button className={settings.theme === 'light' ? 'active' : ''} onClick={() => void onSettings({ theme: 'light' })}><Sun />{mobileText(locale, 'light')}</button><button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => void onSettings({ theme: 'dark' })}><Moon />{mobileText(locale, 'dark')}</button></div></label><label><span>{mobileText(locale, 'view')}</span><div className="settings-segments two"><button className={settings.view === 'grid' ? 'active' : ''} onClick={() => void onSettings({ view: 'grid' })}><LayoutGrid />{mobileText(locale, 'grid')}</button><button className={settings.view === 'list' ? 'active' : ''} onClick={() => void onSettings({ view: 'list' })}><Rows3 />{mobileText(locale, 'list')}</button></div></label><label><span>{sharedText(locale, 'settings.language')}</span><select value={settings.locale} onChange={(event) => void onSettings({ locale: event.target.value as Locale })}>{languages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}</select></label><label><span>{sharedText(locale, 'sort.title')}</span><select value={settings.sortOrder} onChange={(event) => void onSettings({ sortOrder: event.target.value as AppSettings['sortOrder'] })}><option value="manual">{sharedText(locale, 'sort.manual')}</option><option value="updated-desc">{sharedText(locale, 'sort.updated-desc')}</option><option value="updated-asc">{sharedText(locale, 'sort.updated-asc')}</option><option value="created-desc">{sharedText(locale, 'sort.created-desc')}</option><option value="created-asc">{sharedText(locale, 'sort.created-asc')}</option><option value="title-asc">{sharedText(locale, 'sort.title-asc')}</option></select></label><label><span>{mobileText(locale, 'accentColor')}</span><div className="accent-options mobile-accent-options">{(['forest', 'blue', 'violet', 'amber', 'rose', 'graphite'] as const).map((accent) => <button type="button" key={accent} className={`accent-${accent} ${settings.accent === accent ? 'selected' : ''}`} onClick={() => void onSettings({ accent })}>{settings.accent === accent && <Check />}</button>)}</div></label><label><span>{mobileText(locale, 'backgroundTone')}</span><div className="background-options mobile-background-options">{(['neutral', 'sage', 'warm', 'blue', 'rose'] as const).map((backgroundTone) => <button type="button" key={backgroundTone} className={`background-${backgroundTone} ${settings.backgroundTone === backgroundTone ? 'selected' : ''}`} onClick={() => void onSettings({ backgroundTone })}>{settings.backgroundTone === backgroundTone && <Check />}</button>)}</div></label></div>}
    {tab === 'profile' && <div className="settings-section"><div className="profile-hero"><button onClick={() => avatarInput.current?.click()}><MobileAvatar session={session} size="large" /><span>{mobileText(locale, 'changePhoto')}</span></button><div><h2>{session.user.displayName}</h2><p>@{session.user.username}</p></div></div><input ref={avatarInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.target.value = ''; }} /><label><span>{mobileText(locale, 'displayName')}</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label><span>{sharedText(locale, 'login.username')}</span><input value={username} onChange={(event) => setUsername(event.target.value)} /></label><label><span>{mobileText(locale, 'currentPassword')}</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label><span>{mobileText(locale, 'newPassword')}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="settings-primary" onClick={() => void saveProfile()} disabled={busy}>{mobileText(locale, 'saveProfile')}</button><button className="settings-danger" onClick={() => void onSignOut()}><LogOut />{sharedText(locale, 'settings.signOut')}</button></div>}
    {tab === 'data' && <div className="settings-section"><div className="section-title"><DatabaseBackup /><div><h2>{sharedText(locale, 'settings.data')}</h2><p>{mobileText(locale, 'dataHelp')}</p></div></div><h3>{mobileText(locale, 'export')}</h3><div className="data-grid"><button onClick={() => void exportFile('backup')}><FileArchive /><strong>{mobileText(locale, 'fullBackup')}</strong><small>ZIP</small></button><button onClick={() => void exportFile('json')}><FileJson /><strong>JSON</strong></button><button onClick={() => void exportFile('markdown')}><FileText /><strong>Markdown</strong></button><button onClick={() => void exportFile('txt')}><FileText /><strong>TXT</strong></button></div><h3>{mobileText(locale, 'import')}</h3><div className="data-grid"><button onClick={() => portableInput.current?.click()}><Upload /><strong>Suur / JSON / Markdown</strong></button><button onClick={() => keepInput.current?.click()}><Upload /><strong>Google Keep</strong></button></div><input ref={portableInput} hidden type="file" accept=".zip,.json,.md,.markdown" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file, 'portable'); event.target.value = ''; }} /><input ref={keepInput} hidden type="file" accept=".zip,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file, 'keep'); event.target.value = ''; }} /><div className="backup-title"><h3>{mobileText(locale, 'serverBackups')}</h3><button onClick={() => run(async () => { await createRemoteBackup(session); setBackups(await listRemoteBackups(session)); }, mobileText(locale, 'backupCreated'))}><Plus />{mobileText(locale, 'create')}</button></div>{backups.length ? <div className="backup-list">{backups.slice(0, 8).map((backup) => <button key={backup.name} onClick={() => void downloadServerBackup(backup)}><DatabaseBackup /><span><strong>{backup.name}</strong><small>{new Intl.NumberFormat(locale).format(Math.round(backup.size / 1024))} KB · {new Date(backup.createdAt).toLocaleString(locale)}</small></span><Download /></button>)}</div> : <p className="muted-line">{mobileText(locale, 'noBackups')}</p>}</div>}
    {tab === 'notifications' && <div className="settings-section"><label className="switch-row"><span><strong>{mobileText(locale, 'notifications')}</strong><small>{mobileText(locale, 'notificationsHelp')}</small></span><input type="checkbox" checked={settings.notificationsEnabled} onChange={(event) => void onSettings({ notificationsEnabled: event.target.checked })} /></label></div>}
    {tab === 'advanced' && <div className="settings-section"><div className="section-title"><SlidersHorizontal /><div><h2>{sharedText(locale, 'settings.advanced')}</h2><p>{mobileText(locale, 'advancedHelp')}</p></div></div><label className="switch-row"><span><strong>{mobileText(locale, 'completedBottom')}</strong><small>{mobileText(locale, 'completedBottomHelp')}</small></span><input type="checkbox" checked={settings.completedItemsBottom} onChange={(event) => void onSettings({ completedItemsBottom: event.target.checked })} /></label><label><span>{mobileText(locale, 'automaticBackup')}</span><select value={settings.backupFrequency} onChange={(event) => void onSettings({ backupFrequency: event.target.value as AppSettings['backupFrequency'] })}><option value="off">{mobileText(locale, 'off')}</option><option value="daily">{mobileText(locale, 'daily')}</option><option value="weekly">{mobileText(locale, 'weekly')}</option></select></label><label><span>{mobileText(locale, 'trashCleanup')}</span><select value={settings.trashRetentionDays} onChange={(event) => void onSettings({ trashRetentionDays: Number(event.target.value) })}>{[7, 14, 30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days} {mobileText(locale, 'days')}</option>)}</select></label></div>}
    {tab === 'admin' && <div className="settings-section"><div className="section-title"><Shield /><div><h2>{mobileText(locale, 'administration')}</h2><p>{mobileText(locale, 'adminHelp')}</p></div></div><label><span>{mobileText(locale, 'appName')}</span><div className="inline-save"><input value={appName} maxLength={40} onChange={(event) => setAppName(event.target.value)} /><button onClick={() => run(async () => { const nextBranding = await updateRemoteBranding(session, appName); setBranding(nextBranding); await onSession({ ...session, serverName: nextBranding.appName }); }, mobileText(locale, 'saved'))}>{mobileText(locale, 'save')}</button></div></label><div className="branding-mobile"><AppWindow /><span><strong>{mobileText(locale, 'applicationBranding')}</strong><small>{branding.hasCustomIcon ? mobileText(locale, 'customIconActive') : mobileText(locale, 'originalIconActive')}</small></span><button onClick={() => brandingIconInput.current?.click()}>{mobileText(locale, 'uploadIcon')}</button>{branding.hasCustomIcon && <button onClick={() => void run(async () => setBranding(await resetRemoteBrandingIcon(session)), mobileText(locale, 'saved'))}><RotateCcw /></button>}<input ref={brandingIconInput} hidden type="file" accept=".ico,image/x-icon,image/vnd.microsoft.icon" onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(async () => setBranding(await uploadRemoteBrandingIcon(session, file)), mobileText(locale, 'saved')); event.target.value = ''; }} /></div><h3>{sharedText(locale, 'settings.users')}</h3><div className="new-user-form"><input placeholder={sharedText(locale, 'login.username')} value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} /><input placeholder={mobileText(locale, 'displayName')} value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} /><input type="password" placeholder={sharedText(locale, 'login.password')} value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /><select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}><option value="user">User</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select><label><span>{mobileText(locale, 'storageQuota')}</span><input type="number" min={50} max={102400} value={newUser.storageQuotaMb} onChange={(event) => setNewUser({ ...newUser, storageQuotaMb: Number(event.target.value) })} /></label><button onClick={() => run(async () => { const user = await createRemoteUser(session, newUser); setUsers((items) => [...items, user]); setNewUser({ username: '', displayName: '', password: '', role: 'user', storageQuotaMb: 512 }); }, mobileText(locale, 'userCreated'))}><Plus />{mobileText(locale, 'createUser')}</button></div><div className="user-list">{users.map((user) => <div key={user.id}><UserRound /><span><strong>{user.displayName}</strong><small>@{user.username}</small></span><select value={user.role} disabled={user.id === session.user.id} onChange={(event) => void run(async () => { const updated = await updateRemoteUser(session, user.id, { role: event.target.value }); setUsers((items) => items.map((item) => item.id === user.id ? updated : item)); }, mobileText(locale, 'saved'))}><option value="user">User</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select><label className="quota-compact"><input aria-label={mobileText(locale, 'storageQuota')} type="number" min={50} max={102400} defaultValue={user.storageQuotaMb} onBlur={(event) => void run(async () => { const updated = await updateRemoteUser(session, user.id, { storageQuotaMb: Number(event.target.value) }); setUsers((items) => items.map((item) => item.id === user.id ? updated : item)); }, mobileText(locale, 'saved'))} /> MB</label>{user.id !== session.user.id && <button className="danger user-delete" onClick={() => { if (!window.confirm(mobileText(locale, 'deleteUser'))) return; void run(async () => { await deleteRemoteUser(session, user.id); setUsers((items) => items.filter((item) => item.id !== user.id)); }, mobileText(locale, 'saved')); }}><Trash2 /></button>}</div>)}</div></div>}
    {tab === 'about' && <div className="settings-section about-mobile"><img src="/suuricon.png" alt="" /><h2>Suur</h2><p>{sharedText(locale, 'about.attribution')}</p><dl><div><dt>{sharedText(locale, 'about.version')}</dt><dd>{packageJson.version}</dd></div><div><dt>API</dt><dd>{session.apiVersion}</dd></div><div><dt>{mobileText(locale, 'server')}</dt><dd>{session.serverUrl}</dd></div></dl><a href="https://github.com/hng3444/suur" target="_blank" rel="noreferrer">github.com/hng3444/suur</a></div>}
  </main></section>;
}
