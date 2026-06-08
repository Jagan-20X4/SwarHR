import { LS_TOKEN } from "@/constants/storageKeys";

/** All API calls must send session cookie (HttpOnly JWT). */
export const API_FETCH_CREDENTIALS: RequestCredentials = "include";

export function authHeaders(): Record<string, string> {
  const t = localStorage.getItem(LS_TOKEN);
  if (t && t !== "cookie") {
    return { Authorization: "Bearer " + t };
  }
  return {};
}

export function getToken(): string | null {
  const t = localStorage.getItem(LS_TOKEN);
  if (t === "cookie") return "cookie";
  return t;
}

export function clearAuthStorage(): void {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem("swar_role");
  localStorage.removeItem("swar_candidate_id");
  localStorage.removeItem("swar_hr_id");
}

export function apiFetchInit(
  init: RequestInit = {},
): RequestInit {
  return {
    credentials: API_FETCH_CREDENTIALS,
    ...init,
    headers: {
      ...authHeaders(),
      ...((init.headers as Record<string, string>) ?? {}),
    },
  };
}
