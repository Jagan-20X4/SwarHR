import mammoth from "mammoth";

export async function setupMammoth(): Promise<void> {
  if (typeof window === "undefined") return;
  window.mammoth = mammoth;
}
