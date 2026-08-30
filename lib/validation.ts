import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const dateSchema = z.string().datetime({ offset: true }).nullable();
const colors = ['default', 'mint', 'sage', 'sand', 'rose', 'sky', 'lavender'] as const;

export const checklistItemSchema = z.object({
  id: idSchema,
  text: z.string().max(10_000),
  checked: z.boolean(),
});

export const noteCreateSchema = z.object({
  id: idSchema.optional(),
  title: z.string().max(500).default(''),
  content: z.string().max(100_000).default(''),
  type: z.enum(['text', 'checklist']).default('text'),
  items: z.array(checklistItemSchema).max(500).default([]),
  color: z.enum(colors).default('default'),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
  trashedAt: dateSchema.optional().default(null),
  reminderAt: dateSchema.optional().default(null),
  position: z.number().finite().optional(),
  labelIds: z.array(idSchema).max(100).default([]),
});

export const noteUpdateSchema = noteCreateSchema.omit({ id: true }).partial().extend({
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
  sidebarCollapsed: z.boolean().optional(),
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
});

export const userUpdateSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  password: passwordSchema.optional(),
  currentPassword: z.string().max(500).optional(),
  role: z.enum(['superadmin', 'admin', 'user']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'En az bir alan gerekli.');
