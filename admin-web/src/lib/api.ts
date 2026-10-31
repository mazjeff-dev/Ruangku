const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

/** Alamat server tanpa prefix /api/v1 — dipakai untuk file statis (foto ruangan). */
export const SERVER_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+\/?$/, '');

export function assetUrl(path?: string | null) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${SERVER_ORIGIN}${path}`;
}

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string>;

  constructor(message: string, status: number, errors?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export const TOKEN_KEY = 'ruangku_admin_token';
export const USER_KEY = 'ruangku_admin_user';

export function getToken() {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(TOKEN_KEY);
}

export async function apiRequest(
  endpoint: string,
  options: RequestInit = {},
  token?: string
) {
  const headers = new Headers(options.headers);

  // FormData (upload) harus mengatur Content-Type sendiri (boundary).
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const authToken = token ?? getToken();
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });
  } catch {
    throw new ApiError(
      'Tidak dapat terhubung ke server. Pastikan backend sudah berjalan.',
      0
    );
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      result?.message || 'Terjadi kesalahan pada server',
      response.status,
      result?.errors
    );
  }

  return result;
}

/** Bangun query string dengan mengabaikan nilai kosong. */
export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
