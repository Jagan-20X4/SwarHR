import type { ReactNode } from "react";
import { LS_CANDIDATE_ID, LS_HR_ID, LS_ROLE, LS_TOKEN } from "@/constants/storageKeys";

export type UserRole = "candidate" | "hr" | null;

export interface AuthContextValue {
  token: string | null;
  role: UserRole;
  hrId: string | null;
  candidateId: string | null;
  setAuth: (payload: {
    token?: string;
    role: UserRole;
    hrId?: string;
    candidateId?: string;
  }) => void;
  clearAuth: () => void;
}

export function readAuthFromStorage(): Pick<
  AuthContextValue,
  "token" | "role" | "hrId" | "candidateId"
> {
  const role = (localStorage.getItem(LS_ROLE) as UserRole) ?? null;
  return {
    token: role ? "cookie" : localStorage.getItem(LS_TOKEN),
    role,
    hrId: localStorage.getItem(LS_HR_ID),
    candidateId: localStorage.getItem(LS_CANDIDATE_ID),
  };
}

export function writeAuthToStorage(payload: {
  token?: string;
  role: UserRole;
  hrId?: string;
  candidateId?: string;
}): void {
  localStorage.setItem(LS_TOKEN, payload.token || "cookie");
  localStorage.setItem(LS_ROLE, payload.role ?? "");
  if (payload.hrId) localStorage.setItem(LS_HR_ID, payload.hrId);
  else localStorage.removeItem(LS_HR_ID);
  if (payload.candidateId)
    localStorage.setItem(LS_CANDIDATE_ID, payload.candidateId);
  else localStorage.removeItem(LS_CANDIDATE_ID);
}

export function clearAuthStorageFull(): void {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_ROLE);
  localStorage.removeItem(LS_CANDIDATE_ID);
  localStorage.removeItem(LS_HR_ID);
}

export type AuthProviderProps = { children: ReactNode };
