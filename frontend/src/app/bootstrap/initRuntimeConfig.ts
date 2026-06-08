export function initRuntimeConfig(): void {
  if (typeof window === "undefined") return;

  window.CLAUDE_API_URL =
    import.meta.env.VITE_CLAUDE_API_URL?.trim() || "/api/messages";
  window.__PUBLIC_APP_URL__ = (
    import.meta.env.VITE_PUBLIC_APP_URL ?? ""
  )
    .trim()
    .replace(/\/+$/, "");
  window.__ATS_URL__ = import.meta.env.VITE_ATS_URL ?? "";

  if (typeof window.HR_FRONTEND_MODE === "undefined")
    window.HR_FRONTEND_MODE = "builtin";
  if (typeof window.HR_FRONTEND_URL === "undefined")
    window.HR_FRONTEND_URL = "";
  if (typeof window.HR_PASS_SWAR_TOKEN === "undefined")
    window.HR_PASS_SWAR_TOKEN = false;
  if (typeof window.HR_TOKEN_QUERY_PARAM === "undefined")
    window.HR_TOKEN_QUERY_PARAM = "token";
}
