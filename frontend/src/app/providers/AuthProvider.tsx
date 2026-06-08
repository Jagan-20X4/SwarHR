import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearAuthStorageFull,
  readAuthFromStorage,
  writeAuthToStorage,
  type AuthContextValue,
  type UserRole,
} from "@/types/auth";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = readAuthFromStorage();
  const [token, setToken] = useState<string | null>(initial.token);
  const [role, setRole] = useState<UserRole>(initial.role);
  const [hrId, setHrId] = useState<string | null>(initial.hrId);
  const [candidateId, setCandidateId] = useState<string | null>(
    initial.candidateId,
  );

  const setAuth = useCallback(
    (payload: {
      token?: string;
      role: UserRole;
      hrId?: string;
      candidateId?: string;
    }) => {
      writeAuthToStorage(payload);
      setToken(payload.token ?? (payload.role ? "cookie" : null));
      setRole(payload.role);
      setHrId(payload.hrId ?? null);
      setCandidateId(payload.candidateId ?? null);
    },
    [],
  );

  const clearAuth = useCallback(() => {
    clearAuthStorageFull();
    setToken(null);
    setRole(null);
    setHrId(null);
    setCandidateId(null);
  }, []);

  const value = useMemo(
    () => ({ token, role, hrId, candidateId, setAuth, clearAuth }),
    [token, role, hrId, candidateId, setAuth, clearAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
