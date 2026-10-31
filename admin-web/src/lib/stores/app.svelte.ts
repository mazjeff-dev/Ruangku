import { goto } from '$app/navigation';
import { apiRequest, ApiError, TOKEN_KEY, USER_KEY, qs } from '../api';
import { toastError } from './toast.svelte';

export type AdminUser = { id: number; name: string; email: string; role: string; nim?: string | null };

export const app = $state<{ user: AdminUser | null; pending: number; unread: number }>({
  user: null,
  pending: 0,
  unread: 0
});

export function loadSessionUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    app.user = raw ? JSON.parse(raw) : null;
  } catch {
    app.user = null;
  }
}

export function saveSessionUser(user: AdminUser) {
  app.user = user;
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  app.user = null;
  app.pending = 0;
  app.unread = 0;
  goto('/login');
}

/** Tangani error API: 401/403 -> keluar; selain itu tampilkan toast. Mengembalikan pesan. */
export function handleApiError(error: unknown, fallback = 'Terjadi kesalahan', silent = false) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    logout();
    return error.message;
  }
  const message = error instanceof Error ? error.message : fallback;
  if (!silent) toastError(message);
  return message;
}

/** Perbarui lencana sidebar/topbar (menunggu persetujuan & notifikasi belum dibaca). */
export async function refreshBadges() {
  try {
    const [pending, unread] = await Promise.all([
      apiRequest(`/admin/bookings${qs({ status: 'PENDING', pageSize: 1 })}`),
      apiRequest('/notifications/unread-count')
    ]);
    app.pending = pending.total ?? 0;
    app.unread = unread.data?.count ?? 0;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) logout();
  }
}
