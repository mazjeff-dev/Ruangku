const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest(
  endpoint: string,
  options: RequestInit = {},
  token?: string
) {
  const headers = new Headers(options.headers);

  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
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
      response.status
    );
  }

  return result;
}
