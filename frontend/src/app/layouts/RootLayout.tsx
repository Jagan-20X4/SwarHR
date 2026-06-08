import type { ReactNode } from "react";

/** Root layout — font stack matches legacy app. */
export function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif" }}>
      {children}
    </div>
  );
}
