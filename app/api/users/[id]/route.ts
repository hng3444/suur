import { NextResponse } from 'next/server';
import { deleteUser, destroySession, findUserById, revokeUserSessions, updateUser, verifyPassword } from '@/lib/auth';
import { handleApiError, jsonError, requireApiUser, unauthorized } from '@/lib/api';
import { getDb } from '@/lib/db';
import { idParamSchema, userUpdateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const current = await requireApiUser();
    if (!current) return unauthorized();
    const id = idParamSchema.parse((await context.params).id);
    const target = findUserById(id);
    if (!target) return jsonError('Kullanıcı bulunamadı.', 404);
    if (current.id !== id && current.role !== 'superadmin') return jsonError('Bu işlem için yetkiniz yok.', 403);

    const input = userUpdateSchema.parse(await request.json());
    if (current.id === id && input.password && !verifyPassword(input.currentPassword || '', target.password_hash)) {
      return jsonError('Mevcut şifre hatalı.', 403);
    }
    if (current.role !== 'superadmin') delete input.role;
    if (target.role === 'superadmin' && input.role && input.role !== 'superadmin') {
      const count = (getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'").get() as { count: number }).count;
      if (count <= 1) return jsonError('Son superadmin kullanıcısının rolü değiştirilemez.', 409);
    }

    const user = updateUser(id, {
      username: input.username,
      displayName: input.displayName,
      password: input.password,
      role: input.role,
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
    return deleteUser(id) ? NextResponse.json({ deleted: true }) : jsonError('Kullanıcı bulunamadı.', 404);
  } catch (error) {
    return handleApiError(error);
  }
}
