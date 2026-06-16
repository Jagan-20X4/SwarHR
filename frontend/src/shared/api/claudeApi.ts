import { apiFetchInit } from "@/shared/lib/authStorage";

export async function callClaude(
  messages: { role: string; content: string }[],
  system = "",
  json = false,
): Promise<unknown> {
  const url =
    (typeof window !== "undefined" && window.CLAUDE_API_URL) ||
    import.meta.env.VITE_CLAUDE_API_URL ||
    "/api/messages";

  if (!url) {
    await new Promise((r) => setTimeout(r, 600));
    if (json)
      return {
        overallScore: 72,
        summary: "Strong match with relevant experience.",
        recommendation: "shortlist",
        strengths: ["Domain knowledge", "Communication", "Problem solving"],
        areas: ["Stakeholder management", "Tech leadership", "Strategic thinking"],
        tech: 7,
        comm: 8,
        rec: "Hire",
      };
    const lastUser = messages[messages.length - 1]?.content || "";
    if (lastUser.includes("Start") || lastUser.includes("warm greeting"))
      return "Hello! Welcome to Indira IVF. To start, could you walk me through your most relevant experience for this role?";
    return "Thank you for sharing that. Could you tell me about a challenging situation you handled and how you approached it?";
  }

  try {
    const res = await fetch(
      url,
      apiFetchInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-opus-4-8",
          max_tokens: 1000,
          system: system || undefined,
          messages,
        }),
      }),
    );
    const data = await res.json();
    const text =
      (data as { content?: { type: string; text?: string }[] }).content?.find(
        (b) => b.type === "text",
      )?.text || "";
    if (json) {
      try {
        return JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch {
        return null;
      }
    }
    return text;
  } catch (e) {
    console.error("API error:", e);
    return json ? null : "I'm having trouble connecting right now. Please try again.";
  }
}
