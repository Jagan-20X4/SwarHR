export function publicAppOrigin(): string {
  const raw =
    typeof window !== "undefined" ? window.__PUBLIC_APP_URL__ ?? "" : "";
  if (raw && String(raw).trim())
    return String(raw).trim().replace(/\/+$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}
