import { NextResponse } from 'next/server';
import { rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { deleteUser, destroySession, findUserById, revokeUserSessions, updateUser, verifyPassword } from '@/lib/auth';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { dataDirectory, getDb, profileUploadsDirectory, uploadsDirectory } from '@/lib/db';
import { listOwnedAttachmentRecords } from '@/lib/repository';
import { idParamSchema, userUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const current = await requireApiUser({ allowPasswordChange: true });
    if (!current) return unauthorized();
    const id = idParamSchema.parse((await context.params).id);
    const target = findUserById(id);
    if (!target) return jsonError('Kullanıcı bulunamadı.', 404);
    if (current.id !== id && current.role !== 'superadmin') return jsonError('Bu işlem için yetkiniz yok.', 403);

    const input = userUpdateSchema.parse(await request.json());
    if (current.mustChangePassword && (current.id !== id || !input.password)) {
      return jsonError('Devam etmek için önce varsayılan şifrenizi değiştirin.', 403);
    }
    if (current.mustChangePassword) {
      delete input.username;
      delete input.displayName;
      delete input.role;
      delete input.storageQuotaMb;
    }
    if (current.id === id && input.password && !(await verifyPassword(input.currentPassword || '', target.password_hash))) {
      return jsonError('Mevcut şifre hatalı.', 403);
    }
    if (current.role !== 'superadmin') { delete input.role; delete input.storageQuotaMb; }
    if (target.role === 'superadmin' && input.role && input.role !== 'superadmin') {
      const count = (getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'").get() as { count: number }).count;
      if (count <= 1) return jsonError('Son superadmin kullanıcısının rolü değiştirilemez.', 409);
    }

    const user = updateUser(id, {
      username: input.username,
      displayName: input.displayName,
      password: input.password,
      role: input.role,
      storageQuotaMb: input.storageQuotaMb,
    });
    if (input.password) {
      revokeUserSessions(id);
      if (current.id === id) await destroySession();
    }
    return NextResponse.json({ user, reauthenticate: Boolean(input.password && current.id === id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const current = await requireApiUser();
    if (!current) return unauthorized();
    if (current.role !== 'superadmin') return jsonError('Bu işlem için superadmin yetkisi gerekiyor.', 403);
    const id = idParamSchema.parse((await context.params).id);
    if (current.id === id) return jsonError('Kendi hesabınızı silemezsiniz.', 409);
    const target = findUserById(id);
    if (!target) return jsonError('Kullanıcı bulunamadı.', 404);
    if (target.role === 'superadmin') {
      const count = (getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'").get() as { count: number }).count;
      if (count <= 1) return jsonError('Son superadmin kullanıcısı silinemez.', 409);
    }
    const storedNames = listOwnedAttachmentRecords(id).map((record) => record.stored_name);
    const avatarName = target.avatar_stored_name;
    if (!deleteUser(id)) return jsonError('Kullanıcı bulunamadı.', 404);
    await Promise.all(storedNames.map((name) => unlink(path.join(uploadsDirectory(), name)).catch(() => undefined)));
    if (avatarName) await unlink(path.join(profileUploadsDirectory(), avatarName)).catch(() => undefined);
    await rm(path.join(dataDirectory(), 'backups', id), { recursive: true, force: true }).catch(() => undefined);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
