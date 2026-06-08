export interface ParsedPath {
  name:
    | "home"
    | "login"
    | "register"
    | "portal"
    | "hr"
    | "cvAnalyser"
    | "apply";
  returnTo: string;
  jobId?: string;
  invite?: boolean;
}

export function parsePath(pathname: string, search: string): ParsedPath {
  const q = new URLSearchParams(search || "");
  const ret = q.get("returnTo") || "";
  const path = pathname || "/";
  if (path === "/" || path === "") return { name: "home", returnTo: ret };
  if (path === "/login") return { name: "login", returnTo: ret };
  if (path === "/register") return { name: "register", returnTo: ret };
  if (path === "/portal") return { name: "portal", returnTo: ret };
  if (path === "/hr") return { name: "hr", returnTo: ret };
  if (path === "/cv-analyser") return { name: "cvAnalyser", returnTo: ret };
  const m = path.match(/^\/jobs\/([^/]+)\/apply$/);
  if (m) {
    const invite = q.get("invite") === "1" || q.get("invite") === "true";
    return { name: "apply", jobId: m[1], returnTo: ret, invite };
  }
  return { name: "home", returnTo: ret };
}

export function matchJobsApplyDest(dest: string | null | undefined): {
  jobId: string;
  invite: boolean;
} | null {
  if (!dest || typeof dest !== "string") return null;
  const qIdx = dest.indexOf("?");
  const pathOnly = qIdx >= 0 ? dest.slice(0, qIdx) : dest;
  const qs = qIdx >= 0 ? dest.slice(qIdx + 1) : "";
  const m = pathOnly.match(/^\/jobs\/([^/]+)\/apply$/);
  if (!m) return null;
  const params = new URLSearchParams(qs);
  const invite =
    params.get("invite") === "1" || params.get("invite") === "true";
  return { jobId: m[1], invite };
}
