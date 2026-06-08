export const VALID_EXTS = ["jpg", "jpeg", "pdf", "doc", "docx"] as const;

export const SB: Record<string, string> = {
  REGISTERED: "bg-slate-100 text-slate-600",
  APPLIED: "bg-amber-100 text-amber-700",
  SCHEDULED: "bg-sky-100 text-sky-800",
  SHORTLISTED: "bg-blue-100 text-blue-700",
  INTERVIEWED: "bg-teal-100 text-teal-700",
  REJECTED: "bg-red-100 text-red-600",
  WITHDRAWN: "bg-purple-100 text-purple-700",
  REATTMPT: "bg-violet-100 text-violet-800",
};
