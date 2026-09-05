import {
  Archive, ArchiveRestore, ArrowDownUp, Check, FileText, LayoutGrid, LoaderCircle, Menu,
  Palette, Pin, Plus, RefreshCw, Rows3, Tag, Trash2, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import packageJson from '../../package.json';
import { createRemoteMobileSession, discoverSuurServer, mobileEndpoint, mobileAuthorization, type MobileServerInfo } from '../../lib/mobile-client.ts';
import {
  createLabelOperation, createMobileNote, createNoteOperation, deleteLabelOperation, deleteNoteOperation,
  fallbackMobileSettings, removeLocalLabel, removeLocalNote, replaceLocalLabel, replaceLocalNote,
  settingsOperation, sortMobileNotes, updateLabelOperation, updateNoteOperation, visibleMobileNotes, mergeMobileDraft,
} from '../../lib/mobile-note-actions.ts';
import { IndexedDbMobileSyncStore, requestMobileStoragePersistence } from '../../lib/mobile-offline-store.ts';
import { MOBILE_API_VERSION } from '../../lib/mobile-protocol.ts';
import { runMobileSync, type MobileLocalState, type MobilePendingOperation } from '../../lib/mobile-sync.ts';
import type { AppSettings, Attachment, Label, Locale, Note, NoteColor, NoteView, UserSummary } from '../../lib/types.ts';
import {
  createLocalLabel, deleteRemoteAttachment, duplicateRemoteNote, listDirectory, noteHistory,
  refreshMobileUser, restoreRemoteHistory, shareRemoteNote, uploadRemoteAttachment,
} from './mobile-api.ts';
import {
  AppDrawer, CalendarSurface, emptyMobileFilters, LabelsSurface, MobileSettings, SearchSurface,
  type MobileDestination, type MobileFilters, type MobileSyncStatus,
} from './app-surfaces.tsx';
import { MobileAvatar } from './mobile-media.tsx';
import { KeepNoteCard, MobileNoteEditor, noteMatchesQuery } from './note-surfaces.tsx';
import { notificationPermission, onNotificationOpened, shareText, syncNativeReminders } from './native-capabilities.ts';
import { applyDocumentLocale, mobileLocale, mobileText, sharedText } from './mobile-i18n.ts';
import { clearMobileSession, loadMobileSession, saveMobileSession, type StoredMobileSession } from './secure-session.ts';
import { NotesLayout } from './notes-layout.tsx';
import { useBackLayer } from './use-back-layer.ts';

type Phase = 'boot' | 'login' | 'ready';
type EditorState = { note: Note; isNew: boolean; original?: Note } | null;
type BulkSheet = 'color' | 'labels' | null;
const noteColors: NoteColor[] = ['default', 'mint', 'sage', 'sand', 'rose', 'sky', 'lavender'];

function Logo() { return <img className="mobile-logo" src="/suuricon.png" alt="" aria-hidden="true" />; }

function humanError(error: unknown, locale: Locale) {
  const code = error instanceof Error ? error.message : '';
  if (['INCOMPATIBLE_SERVER', 'INVALID_SERVER_URL', 'SERVER_URL_REQUIRED'].includes(code)) return mobileText(locale, 'connectionFailed');
  if (code === 'HTTPS_REQUIRED') return locale === 'tr' ? 'Genel kullanıma açık sunucularda HTTPS zorunludur.' : 'HTTPS is required for remote servers.';
  if (code === 'INVALID_CREDENTIALS' || code === 'UNAUTHORIZED') return sharedText(locale, 'login.invalid');
  if (code === 'RATE_LIMITED') return locale === 'tr' ? 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.' : 'Too many attempts. Try again later.';
  return mobileText(locale, 'connectionFailed');
}

function ConnectScreen({ locale, initialServer, onConnected }: { locale: Locale; initialServer: string; onConnected: (session: StoredMobileSession) => Promise<void> }) {
  const [serverUrl, setServerUrl] = useState(initialServer);
  const [server, setServer] = useState<{ baseUrl: string; info: MobileServerInfo } | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checkServer = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const discovered = await discoverSuurServer(serverUrl);
      if (discovered.info.apiVersion !== MOBILE_API_VERSION || !discovered.info.synchronization) throw new Error('API_MISMATCH');
      setServer(discovered);
    } catch (caught) { setError(caught instanceof Error && caught.message === 'API_MISMATCH' ? mobileText(locale, 'apiMismatch') : humanError(caught, locale)); } finally { setBusy(false); }
  };
  const signIn = async (event: FormEvent) => {
    event.preventDefault(); if (!server) return; setBusy(true); setError('');
    try {
      const result = await createRemoteMobileSession({ serverUrl: server.baseUrl, username, password, deviceName: navigator.userAgent.includes('Android') ? 'Android device' : 'Suur mobile client', platform: 'android', clientVersion: packageJson.version });
      if (result.session.apiVersion !== MOBILE_API_VERSION) throw new Error('API_MISMATCH');
      await onConnected({ serverUrl: result.baseUrl, serverId: server.info.serverId, serverName: server.info.name, apiVersion: result.session.apiVersion, token: result.session.token, expiresAt: result.session.expiresAt, user: result.session.user });
    } catch (caught) { setError(caught instanceof Error && caught.message === 'API_MISMATCH' ? mobileText(locale, 'apiMismatch') : humanError(caught, locale)); } finally { setBusy(false); }
  };
  return <main className="connect-page"><section className="connect-card">
    <div className="connect-visual"><Logo /></div>
    <div className="connect-brand"><strong>Suur</strong></div>
    <h1>{server ? mobileText(locale, 'deviceLogin') : mobileText(locale, 'connectTitle')}</h1>
    {!server ? <form onSubmit={checkServer}><label htmlFor="server-url">{mobileText(locale, 'serverAddress')}</label><div className="field"><input id="server-url" inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://notes.example.com" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} required autoFocus /></div>{error && <p className="form-error">{error}</p>}<button className="connect-primary" disabled={busy}>{busy && <LoaderCircle className="spin" />}{busy ? mobileText(locale, 'checking') : mobileText(locale, 'continue')}</button></form>
      : <form onSubmit={signIn}><button type="button" className="server-choice" onClick={() => setServer(null)}><Check /><span><small>{mobileText(locale, 'compatible')}</small>{server.info.name}</span></button><label htmlFor="username">{sharedText(locale, 'login.username')}</label><div className="field"><input id="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus /></div><label htmlFor="password">{sharedText(locale, 'login.password')}</label><div className="field"><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>{error && <p className="form-error">{error}</p>}<button className="connect-primary" disabled={busy}>{busy && <LoaderCircle className="spin" />}{busy ? sharedText(locale, 'login.loading') : sharedText(locale, 'login.action')}</button></form>}
  </section></main>;
}

function matchesFilters(note: Note, filters: MobileFilters) {
  if (filters.type !== 'all' && note.type !== filters.type) return false;
  if (filters.color !== 'all' && note.color !== filters.color) return false;
  if (filters.label !== 'all' && !note.labels.some((label) => label.id === filters.label)) return false;
  if (filters.reminder === 'yes' && !note.reminderAt) return false;
  if (filters.reminder === 'no' && note.reminderAt) return false;
  if (filters.date !== 'all') {
    const days = filters.date === 'today' ? 1 : filters.date === 'week' ? 7 : 30;
    if (Date.now() - new Date(note.updatedAt).getTime() > days * 86_400_000) return false;
  }
  return true;
}

function viewTitle(destination: MobileDestination, activeLabel: Label | undefined, locale: Locale) {
  if (activeLabel) return activeLabel.name;
  if (destination === 'labels') return sharedText(locale, 'nav.labels');
  if (destination === 'settings') return sharedText(locale, 'nav.settings');
  return sharedText(locale, `nav.${destination}` as Parameters<typeof sharedText>[1]);
}

export function MobileApp() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [session, setSession] = useState<StoredMobileSession | null>(null);
  const [state, setState] = useState<MobileLocalState | null>(null);
  const [locale, setLocale] = useState<Locale>(() => mobileLocale());
  const [status, setStatus] = useState<MobileSyncStatus>('idle');
  const [pending, setPending] = useState(0);
  const [destination, setDestination] = useState<MobileDestination>('notes');
  const [activeLabelId, setActiveLabelId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<MobileFilters>(emptyMobileFilters);
  const [editor, setEditor] = useState<EditorState>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkSheet, setBulkSheet] = useState<BulkSheet>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const [snackbar, setSnackbar] = useState('');
  const [initialServer, setInitialServer] = useState('');
  const [store, setStore] = useState<IndexedDbMobileSyncStore | null>(null);
  const storeRef = useRef<IndexedDbMobileSyncStore | null>(null);
  const stateRef = useRef<MobileLocalState | null>(null);
  const operationLock = useRef<Promise<unknown>>(Promise.resolve());
  const booted = useRef(false);

  const serialize = useCallback(<T,>(task: () => Promise<T>) => {
    const run = operationLock.current.then(task, task);
    operationLock.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);
  const syncFor = useCallback(async (record: StoredMobileSession, store: IndexedDbMobileSyncStore) => serialize(async () => {
    if (storeRef.current !== store) return null;
    setStatus('syncing');
    try {
      const result = await runMobileSync({ serverUrl: record.serverUrl, token: record.token, store });
      if (storeRef.current !== store) return null;
      setState(result.state); setPending(result.pending);
      if (result.authRequired) setStatus('auth'); else if (result.blocked) setStatus('blocked'); else if (!result.online) setStatus('offline'); else setStatus(result.pending ? 'pending' : 'synced');
      return result;
    } catch (error) {
      if (storeRef.current !== store) return null;
      const code = error instanceof Error ? error.message : '';
      setStatus(code === 'UNAUTHORIZED' ? 'auth' : code.startsWith('HTTP_') || code.includes('NETWORK') ? 'offline' : 'blocked');
      return null;
    }
  }), [serialize]);
  const updateSession = useCallback(async (record: StoredMobileSession) => { setSession(record); await saveMobileSession(record); }, []);
  const startSession = useCallback(async (record: StoredMobileSession) => {
    const store = new IndexedDbMobileSyncStore(record.serverId, record.user.id);
    await store.initialize();
    const local = await store.readState();
    const recovery = await store.readEditorDraft();
    storeRef.current = store; setStore(store); setSession(record); setState(local); setLocale(local.settings?.locale || mobileLocale()); setPending((await store.readQueue()).length); setPhase('ready');
    if (recovery) setEditor({ ...recovery, isNew: recovery.isNew && !local.notes.some((note) => note.id === recovery.note.id) });
    void requestMobileStoragePersistence();
    void refreshMobileUser(record).then((user) => storeRef.current === store ? updateSession({ ...record, user }) : undefined).catch(() => undefined);
    void listDirectory(record).then((users) => { if (storeRef.current === store) setUsers(users); }).catch(() => undefined);
    void syncFor(record, store);
  }, [syncFor, updateSession]);

  useEffect(() => { if (booted.current) return; booted.current = true; void loadMobileSession().then((stored) => stored ? startSession(stored) : setPhase('login')).catch(() => setPhase('login')); }, [startSession]);
  useEffect(() => { applyDocumentLocale(locale); }, [locale]);
  useEffect(() => { stateRef.current = state; }, [state]);
  const settings = state?.settings || fallbackMobileSettings;
  useEffect(() => {
    // Local edits also schedule reminders while the server is unavailable.
    void syncNativeReminders(state?.settings?.notificationsEnabled ? state.notes : [], locale, session?.serverName || 'Suur').catch(() => undefined);
  }, [state, locale, session?.serverName]);
  useEffect(() => { document.documentElement.dataset.theme = settings.theme; document.documentElement.dataset.accent = settings.accent; document.documentElement.dataset.tone = settings.backgroundTone; }, [settings.accent, settings.backgroundTone, settings.theme]);
  useEffect(() => {
    const online = () => { if (session && storeRef.current) void syncFor(session, storeRef.current); };
    const offline = () => setStatus('offline');
    const visible = () => { if (document.visibilityState === 'visible') online(); };
    window.addEventListener('online', online); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible); };
  }, [session, syncFor]);
  useEffect(() => {
    const handle = onNotificationOpened((noteId) => {
      const note = stateRef.current?.notes.find((item) => item.id === noteId);
      if (note) setEditor({ note, original: note, isNew: false });
    });
    return () => { void handle.then((listener) => listener.remove()); };
  }, []);
  useEffect(() => { if (!snackbar) return; const timer = window.setTimeout(() => setSnackbar(''), 3_500); return () => window.clearTimeout(timer); }, [snackbar]);
  useEffect(() => {
    if (phase !== 'ready' || drawerOpen || searchOpen || editor || sortOpen || bulkSheet || selected.size > 0) {
      return;
    }
    let previousY = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const currentY = Math.max(0, window.scrollY);
        const delta = currentY - previousY;
        if (currentY < 28) setTopbarHidden(false);
        else if (delta > 7 && currentY > 92) setTopbarHidden(true);
        else if (delta < -7) setTopbarHidden(false);
        previousY = currentY;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [bulkSheet, drawerOpen, editor, phase, searchOpen, selected.size, sortOpen]);

  const connect = async (record: StoredMobileSession) => { await saveMobileSession(record); await startSession(record); };
  const commit = async (operations: MobilePendingOperation[], update: (latest: MobileLocalState) => MobileLocalState) => {
    const store = storeRef.current; if (!store) return;
    await serialize(async () => {
      const latest = await store.readState(); const next = update(latest);
      await store.writeStateAndEnqueueMany(next, operations); setState(next);
      const queue = await store.readQueue(); setPending(queue.length); setStatus('pending');
    });
    if (session) void syncFor(session, store);
  };
  const persist = async (update: (latest: MobileLocalState) => MobileLocalState) => {
    const store = storeRef.current; if (!store) return;
    await serialize(async () => { const next = update(await store.readState()); await store.writeState(next); setState(next); });
  };
  const saveNote = async (note: Note, isNew = false, original?: Note) => {
    const store = storeRef.current;
    if (!store) throw new Error('OFFLINE_STORE_UNAVAILABLE');
    await serialize(async () => {
      const latest = await store.readState();
      const current = latest.notes.find((item) => item.id === note.id);
      const updated = current && original ? mergeMobileDraft(current, note, original) : { ...note, updatedAt: new Date().toISOString() };
      const operation = isNew && !current ? createNoteOperation(updated) : updateNoteOperation(updated);
      const next = replaceLocalNote(latest, updated);
      await store.writeStateAndEnqueue(next, operation);
      setState(next); setPending((await store.readQueue()).length); setStatus('pending');
    });
    if (session) void syncFor(session, store);
  };
  const trashNote = async (note: Note) => { const updated = { ...note, trashedAt: note.trashedAt ? null : new Date().toISOString(), archived: note.trashedAt ? note.archived : false }; await saveNote(updated); setEditor(null); };
  const permanentlyDelete = async (note: Note) => {
    if (!window.confirm(`${mobileText(locale, 'deleteForever')}?`)) return false;
    await commit([deleteNoteOperation(note.id)], (latest) => removeLocalNote(latest, note.id));
    setEditor(null);
    return true;
  };
  const changeSettings = async (patch: Partial<AppSettings>) => {
    await commit([settingsOperation(patch)], (latest) => ({ ...latest, settings: { ...(latest.settings || fallbackMobileSettings), ...patch } }));
    if (patch.locale) setLocale(patch.locale);
    if (patch.notificationsEnabled !== undefined && state) {
      if (patch.notificationsEnabled) await syncNativeReminders(state.notes, patch.locale || locale, session?.serverName || 'Suur', true);
      else if (await notificationPermission()) await syncNativeReminders([], locale, session?.serverName || 'Suur');
    }
  };
  const signOut = async () => {
    const record = session;
    storeRef.current = null;
    if (record) await fetch(mobileEndpoint(record.serverUrl, '/api/mobile/auth/session'), { method: 'DELETE', headers: mobileAuthorization(record.token), credentials: 'omit', redirect: 'manual', signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
    await clearMobileSession(); setInitialServer(record?.serverUrl || ''); storeRef.current = null; setStore(null); setSession(null); setState(null); setEditor(null); setPhase('login');
  };
  const navigate = (next: MobileDestination, labelId = '') => { setDestination(next); setActiveLabelId(labelId); setDrawerOpen(false); setSelected(new Set()); setEditor(null); };
  const toggleSelected = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const bulkUpdate = async (mapper: (note: Note) => Note) => {
    if (!state) return;
    const updates = state.notes.filter((note) => selected.has(note.id)).map(mapper);
    await commit(updates.map(updateNoteOperation), (latest) => ({ ...latest, notes: latest.notes.map((note) => updates.find((item) => item.id === note.id) || note) }));
    setSelected(new Set()); setBulkSheet(null);
  };
  const bulkDeleteForever = async () => {
    if (!state) return;
    if (!window.confirm(`${mobileText(locale, 'deleteForever')} (${selected.size})?`)) return;
    const ids = state.notes.filter((note) => selected.has(note.id) && note.ownerId === state.userId).map((note) => note.id);
    await commit(ids.map(deleteNoteOperation), (latest) => ({ ...latest, notes: latest.notes.filter((note) => !ids.includes(note.id)) })); setSelected(new Set());
  };
  const createLabel = async (name: string, color: string) => { const label = createLocalLabel(name, color); await commit([createLabelOperation(label)], (latest) => replaceLocalLabel(latest, label)); };
  const updateLabel = async (label: Label) => { const next = { ...label, updatedAt: new Date().toISOString() }; await commit([updateLabelOperation(next)], (latest) => replaceLocalLabel(latest, next)); };
  const deleteLabel = async (label: Label) => commit([deleteLabelOperation(label.id)], (latest) => removeLocalLabel(latest, label.id));
  const uploadAttachment = async (note: Note, file: File) => {
    if (!session) return null;
    // A newly-created offline-first note may still be waiting in the mutation
    // queue. Flush it before using the regular attachment endpoint.
    if (storeRef.current) {
      const result = await syncFor(session, storeRef.current);
      if (!result?.online || result.blocked || result.authRequired || result.pending) throw new Error(mobileText(locale, 'onlineRequired'));
    }
    const attachment = await uploadRemoteAttachment(session, note.id, file);
    await persist((latest) => {
      const current = latest.notes.find((item) => item.id === note.id);
      return current ? replaceLocalNote(latest, { ...current, attachments: [...current.attachments.filter((item) => item.id !== attachment.id), attachment] }) : latest;
    });
    if (storeRef.current) await syncFor(session, storeRef.current);
    return attachment;
  };
  const deleteAttachment = async (note: Note, attachment: Attachment) => {
    if (!session) return;
    await deleteRemoteAttachment(session, attachment.id); await storeRef.current?.deleteAttachment(attachment.id);
    await persist((latest) => {
      const current = latest.notes.find((item) => item.id === note.id);
      return current ? replaceLocalNote(latest, { ...current, attachments: current.attachments.filter((item) => item.id !== attachment.id) }) : latest;
    });
    if (storeRef.current) await syncFor(session, storeRef.current);
  };

  const noteView: NoteView = destination === 'labels' || destination === 'settings' ? 'notes' : destination;
  const notes = useMemo(() => {
    if (!state) return [];
    return sortMobileNotes(visibleMobileNotes(state, noteView, '').filter((note) => (!activeLabelId || note.labels.some((label) => label.id === activeLabelId)) && noteMatchesQuery(note, search) && matchesFilters(note, filters)), settings.sortOrder);
  }, [activeLabelId, filters, noteView, search, settings.sortOrder, state]);
  const pinned = notes.filter((note) => note.pinned);
  const others = notes.filter((note) => !note.pinned);
  const activeLabel = state?.labels.find((label) => label.id === activeLabelId);
  const online = (typeof navigator === 'undefined' || navigator.onLine !== false) && !['offline', 'auth', 'blocked'].includes(status);
  const openNote = (note: Note) => {
    setEditor({ note, original: note, isNew: false });
  };

  const flushRemoteChanges = async () => {
    if (!session || !storeRef.current) throw new Error(mobileText(locale, 'onlineRequired'));
    const result = await syncFor(session, storeRef.current);
    if (!result?.online || result.blocked || result.authRequired || result.pending) throw new Error(mobileText(locale, 'onlineRequired'));
  };

  const duplicateForEditor = async (note: Note) => {
    if (!session) throw new Error(mobileText(locale, 'onlineRequired'));
    await flushRemoteChanges();
    const duplicate = await duplicateRemoteNote(session, note.id);
    await persist((latest) => replaceLocalNote(latest, duplicate));
    setSnackbar(mobileText(locale, 'duplicate'));
  };

  const shareForEditor = async (note: Note) => {
    if (!session) throw new Error(mobileText(locale, 'onlineRequired'));
    await flushRemoteChanges();
    const url = await shareRemoteNote(session, note.id);
    await shareText(note.title || 'Suur', note.content || note.title, url);
  };

  const historyForEditor = async (note: Note) => {
    if (!session) throw new Error(mobileText(locale, 'onlineRequired'));
    await flushRemoteChanges();
    return noteHistory(session, note.id);
  };

  const restoreHistoryForEditor = async (note: Note, historyId: string) => {
    if (!session) throw new Error(mobileText(locale, 'onlineRequired'));
    await flushRemoteChanges();
    const restored = await restoreRemoteHistory(session, note.id, historyId);
    await persist((latest) => replaceLocalNote(latest, restored));
    setSnackbar(mobileText(locale, 'saved'));
    return restored;
  };

  useBackLayer(destination !== 'notes', 1, () => navigate('notes'));
  useBackLayer(selected.size > 0, 2, () => setSelected(new Set()));
  useBackLayer(drawerOpen, 3, () => setDrawerOpen(false));
  useBackLayer(searchOpen, 4, () => setSearchOpen(false));
  useBackLayer(sortOpen || bulkSheet !== null, 5, () => { setSortOpen(false); setBulkSheet(null); });

  if (phase === 'boot') return <main className="boot-screen"><Logo /><LoaderCircle className="spin" /></main>;
  if (phase === 'login') return <ConnectScreen locale={locale} initialServer={initialServer} onConnected={connect} />;
  if (!session || !state) return null;
  if (destination === 'settings') return <MobileSettings settings={settings} locale={locale} session={session} onBack={() => navigate('notes')} onSettings={changeSettings} onSession={updateSession} onSync={async () => { if (storeRef.current) await syncFor(session, storeRef.current); }} onSignOut={signOut} />;
  if (destination === 'labels') return <LabelsSurface labels={state.labels} locale={locale} onBack={() => navigate('notes')} onCreate={createLabel} onUpdate={updateLabel} onDelete={deleteLabel} />;

  return <main className="suur-mobile-shell">
    <AppDrawer open={drawerOpen} destination={destination} activeLabel={activeLabelId} labels={state.labels} session={session} status={status} pending={pending} locale={locale} onNavigate={navigate} onClose={() => setDrawerOpen(false)} onSync={() => { if (storeRef.current) void syncFor(session, storeRef.current); }} />
    {selected.size > 0 ? <header className="selection-bar"><button onClick={() => setSelected(new Set())}><X /></button><strong>{selected.size}</strong><span /><button onClick={() => void bulkUpdate((note) => ({ ...note, pinned: true }))}><Pin /></button><button onClick={() => void bulkUpdate((note) => ({ ...note, archived: destination !== 'archive', trashedAt: null }))}>{destination === 'archive' ? <ArchiveRestore /> : <Archive />}</button><button onClick={() => setBulkSheet('color')}><Palette /></button><button onClick={() => setBulkSheet('labels')}><Tag /></button>{destination === 'trash' ? <button onClick={() => void bulkDeleteForever()}><Trash2 /></button> : <button onClick={() => void bulkUpdate((note) => ({ ...note, trashedAt: new Date().toISOString(), archived: false }))}><Trash2 /></button>}</header>
      : <header className={`keep-topbar ${topbarHidden && !drawerOpen && !searchOpen && !editor && !sortOpen && !bulkSheet ? 'is-hidden' : ''}`}><button className="top-icon" aria-label={sharedText(locale, 'nav.notes')} onClick={() => setDrawerOpen(true)}><Menu /></button><button className="top-search" onClick={() => setSearchOpen(true)}><span>{sharedText(locale, 'search')}</span>{Object.values(filters).some((value) => value !== 'all') && <i />}</button><button className="top-icon" aria-label={mobileText(locale, settings.view === 'grid' ? 'list' : 'grid')} onClick={() => void changeSettings({ view: settings.view === 'grid' ? 'list' : 'grid' })}>{settings.view === 'grid' ? <Rows3 /> : <LayoutGrid />}</button><button className="top-icon sort-button" aria-label={sharedText(locale, 'sort.title')} onClick={() => setSortOpen(!sortOpen)}><ArrowDownUp /></button><button className="avatar-button" aria-label={sharedText(locale, 'nav.settings')} onClick={() => navigate('settings')}><MobileAvatar session={session} size="small" /></button></header>}
    {(destination !== 'notes' || activeLabel || status !== 'synced') && <div className={`page-title-row ${destination === 'notes' && !activeLabel ? 'status-only' : ''}`}><div>{(destination !== 'notes' || activeLabel) && <h1>{viewTitle(destination, activeLabel, locale)}</h1>}{status !== 'synced' && <span className={`status-mini status-${status}`}>{status === 'syncing' && <RefreshCw className="spin" />}{status === 'offline' ? sharedText(locale, 'status.offline') : pending ? mobileText(locale, 'pending', { count: pending }) : status === 'syncing' ? sharedText(locale, 'status.syncing') : ''}</span>}</div></div>}
    {status === 'auth' && <button className="sync-warning" onClick={() => void signOut()}>{mobileText(locale, 'authRequired')}<strong>{mobileText(locale, 'retryLogin')}</strong></button>}
    {status === 'blocked' && <p className="sync-warning">{mobileText(locale, 'syncBlocked')}</p>}
    {destination === 'calendar' ? <CalendarSurface notes={state.notes} locale={locale} onOpen={openNote} /> : <section className={`notes-stage view-${settings.view}`}>
      {pinned.length > 0 && <section className="note-section"><h2>{sharedText(locale, 'pinned')}</h2><NotesLayout grid={settings.view === 'grid'}>{pinned.map((note) => <KeepNoteCard key={note.id} note={note} locale={locale} session={session} store={store} selected={selected.has(note.id)} selectionMode={selected.size > 0} onOpen={() => openNote(note)} onSelect={() => toggleSelected(note.id)} />)}</NotesLayout></section>}
      {others.length > 0 && <section className="note-section"><h2>{pinned.length ? sharedText(locale, 'others') : ''}</h2><NotesLayout grid={settings.view === 'grid'}>{others.map((note) => <KeepNoteCard key={note.id} note={note} locale={locale} session={session} store={store} selected={selected.has(note.id)} selectionMode={selected.size > 0} onOpen={() => openNote(note)} onSelect={() => toggleSelected(note.id)} />)}</NotesLayout></section>}
      {!notes.length && <div className="notes-empty"><FileText /><strong>{search || Object.values(filters).some((value) => value !== 'all') ? sharedText(locale, 'empty.noMatch') : mobileText(locale, 'noNotes')}</strong><span>{sharedText(locale, search ? 'empty.searchHint' : destination === 'trash' ? 'empty.trashHint' : 'empty.firstHint')}</span></div>}
    </section>}
    {destination === 'notes' && !activeLabelId && selected.size === 0 && <button className="compose-fab" onClick={() => setEditor({ note: createMobileNote(state, 'text'), isNew: true })} aria-label={sharedText(locale, 'newNote')}><Plus /></button>}
    {sortOpen && <div className="sort-menu"><header><strong>{sharedText(locale, 'sort.title')}</strong><button onClick={() => setSortOpen(false)}><X /></button></header>{(['manual', 'updated-desc', 'updated-asc', 'created-desc', 'created-asc', 'title-asc'] as AppSettings['sortOrder'][]).map((order) => <button key={order} className={settings.sortOrder === order ? 'selected' : ''} onClick={() => { void changeSettings({ sortOrder: order }); setSortOpen(false); }}>{sharedText(locale, `sort.${order}` as Parameters<typeof sharedText>[1])}{settings.sortOrder === order && <Check />}</button>)}</div>}
    {bulkSheet && <div className="subsheet-backdrop" onClick={() => setBulkSheet(null)}><section className="bulk-sheet" onClick={(event) => event.stopPropagation()}><header><strong>{bulkSheet === 'color' ? mobileText(locale, 'color') : mobileText(locale, 'labels')}</strong><button onClick={() => setBulkSheet(null)}><X /></button></header>{bulkSheet === 'color' ? <div className="bulk-colors">{noteColors.map((color) => <button key={color} className={`color-choice note-color-${color}`} onClick={() => void bulkUpdate((note) => ({ ...note, color }))} />)}</div> : <div className="bulk-labels">{state.labels.map((label) => <button key={label.id} onClick={() => void bulkUpdate((note) => ({ ...note, labels: note.labels.some((item) => item.id === label.id) ? note.labels : [...note.labels, label] }))}><i style={{ background: label.color }} />{label.name}</button>)}</div>}</section></div>}
    {searchOpen && <SearchSurface locale={locale} query={search} filters={filters} labels={state.labels} onQuery={setSearch} onFilters={setFilters} onClose={() => setSearchOpen(false)} />}
    {editor && <MobileNoteEditor originalNote={editor.original} note={editor.note} isNew={editor.isNew} locale={locale} labels={state.labels} users={users} session={session} store={store} online={online} completedItemsBottom={settings.completedItemsBottom} onClose={() => setEditor(null)} onSave={saveNote} onDelete={trashNote} onDeleteForever={permanentlyDelete} onDuplicate={duplicateForEditor} onShare={shareForEditor} onHistory={historyForEditor} onRestoreHistory={restoreHistoryForEditor} onUpload={uploadAttachment} onDeleteAttachment={deleteAttachment} onRequestNotifications={async () => { const granted = await notificationPermission(true); if (granted && !settings.notificationsEnabled) await changeSettings({ notificationsEnabled: true }); return granted; }} />}
    {snackbar && <button className="mobile-snackbar" onClick={() => setSnackbar('')}>{snackbar}<X /></button>}
  </main>;
}
