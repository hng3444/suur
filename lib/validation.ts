import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const dateSchema = z.string().datetime({ offset: true }).nullable();
const colors = ['default', 'mint', 'sage', 'sand', 'rose', 'sky', 'lavender'] as const;

export const checklistItemSchema = z.object({
  id: idSchema,
  text: z.string().max(10_000),
  checked: z.boolean(),
});

const noteFieldsSchema = z.object({
  title: z.string().max(500),
  content: z.string().max(100_000),
  contentFormat: z.enum(['plain', 'markdown']),
  type: z.enum(['text', 'checklist']),
  items: z.array(checklistItemSchema).max(500),
  color: z.enum(colors),
  pinned: z.boolean(),
  archived: z.boolean(),
  trashedAt: dateSchema,
  reminderAt: dateSchema,
  position: z.number().finite().optional(),
  labelIds: z.array(idSchema).max(100),
  assignedUserId: idSchema.nullable(),
});

export const noteCreateSchema = noteFieldsSchema.extend({
  id: idSchema.optional(),
  title: noteFieldsSchema.shape.title.default(''),
  content: noteFieldsSchema.shape.content.default(''),
  contentFormat: noteFieldsSchema.shape.contentFormat.default('plain'),
  type: noteFieldsSchema.shape.type.default('text'),
  items: noteFieldsSchema.shape.items.default([]),
  color: noteFieldsSchema.shape.color.default('default'),
  pinned: noteFieldsSchema.shape.pinned.default(false),
  archived: noteFieldsSchema.shape.archived.default(false),
  trashedAt: noteFieldsSchema.shape.trashedAt.default(null),
  reminderAt: noteFieldsSchema.shape.reminderAt.default(null),
  labelIds: noteFieldsSchema.shape.labelIds.default([]),
  assignedUserId: noteFieldsSchema.shape.assignedUserId.default(null),
});

export const noteUpdateSchema = noteFieldsSchema.partial().extend({
  baseVersion: z.number().int().positive().optional(),
});

export const reorderSchema = z.object({
  positions: z.array(z.object({ id: idSchema, position: z.number().finite() })).min(1).max(1_000),
});

export const labelCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#198754'),
});

export const labelUpdateSchema = labelCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'En az bir alan gerekli.',
);

export const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  view: z.enum(['grid', 'list']).optional(),
  sortOrder: z.enum(['manual', 'updated-desc', 'updated-asc', 'created-desc', 'created-asc', 'title-asc']).optional(),
  backgroundTone: z.enum(['neutral', 'sage', 'warm', 'blue', 'rose']).optional(),
  sidebarCollapsed: z.boolean().optional(),
  locale: z.enum(['en', 'zh', 'hi', 'es', 'ar', 'fr', 'bn', 'pt', 'ru', 'tr']).optional(),
  accent: z.enum(['forest', 'emerald', 'teal', 'blue', 'violet', 'amber']).optional(),
  notificationsEnabled: z.boolean().optional(),
  backupFrequency: z.enum(['off', 'daily', 'weekly']).optional(),
  trashRetentionDays: z.number().int().min(1).max(365).optional(),
  completedItemsBottom: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'En az bir ayar gerekli.');

export const idParamSchema = idSchema;

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(500),
});

const usernameSchema = z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Kullanıcı adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.');
const passwordSchema = z.string().min(7).max(200);

export const userCreateSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(100),
  password: passwordSchema,
  role: z.enum(['superadmin', 'admin', 'user']).default('user'),
  storageQuotaMb: z.number().int().min(50).max(102_400).default(512),
});

export const userUpdateSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  password: passwordSchema.optional(),
  currentPassword: z.string().max(500).optional(),
  role: z.enum(['superadmin', 'admin', 'user']).optional(),
  storageQuotaMb: z.number().int().min(50).max(102_400).optional(),
}).refine((value) => Object.keys(value).length > 0, 'En az bir alan gerekli.');
