import { API_FETCH_CREDENTIALS, authHeaders } from "@/shared/lib/authStorage";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base = import.meta.env.VITE_API_URL ?? "";
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...authHeaders(),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: API_FETCH_CREDENTIALS,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
