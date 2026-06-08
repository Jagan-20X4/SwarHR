import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { LS_ROLE } from "@/constants/storageKeys";

export function ProtectedRoute({
  role: requiredRole,
  children,
}: {
  role: "candidate" | "hr";
  children: ReactNode;
}) {
  const location = useLocation();
  const role = localStorage.getItem(LS_ROLE);

  if (!role || role !== requiredRole) {
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return <>{children}</>;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const role = localStorage.getItem(LS_ROLE);
  if (role === "candidate") return <Navigate to="/portal" replace />;
  if (role === "hr") return <Navigate to="/hr" replace />;
  return <>{children}</>;
}

/** Requires any authenticated session (HR or candidate). */
export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const role = localStorage.getItem(LS_ROLE);
  if (!role) {
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return <>{children}</>;
}
