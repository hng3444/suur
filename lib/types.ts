export type NoteType = 'text' | 'checklist';

export type NoteColor = 'default' | 'mint' | 'sage' | 'sand' | 'rose' | 'sky' | 'lavender';

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  noteId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
}

export interface Note {
  id: string;
  ownerId: string;
  assignedUserId: string | null;
  title: string;
  content: string;
  contentFormat: 'plain' | 'markdown';
  type: NoteType;
  items: ChecklistItem[];
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  trashedAt: string | null;
  reminderAt: string | null;
  position: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  labels: Label[];
  attachments: Attachment[];
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  view: 'grid' | 'list';
  sidebarCollapsed: boolean;
  locale: Locale;
  accent: 'forest' | 'emerald' | 'teal' | 'blue' | 'violet' | 'amber';
  notificationsEnabled: boolean;
  backupFrequency: 'off' | 'daily' | 'weekly';
  trashRetentionDays: number;
  completedItemsBottom: boolean;
}

export type Locale = 'en' | 'zh' | 'hi' | 'es' | 'ar' | 'fr' | 'bn' | 'pt' | 'ru' | 'tr';

export type UserRole = 'superadmin' | 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
  storageQuotaMb: number;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UserSummary = Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'>;

export type NoteView = 'notes' | 'reminders' | 'calendar' | 'archive' | 'trash';
