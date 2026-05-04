const SYSTEM_PROMPT =
  "You are an expert technical recruiter at Indira IVF, India's largest fertility healthcare chain. You analyse CVs with rigour and zero bias. You NEVER score based on gender, age, photo, marital status, religion, caste, or location. You output ONLY valid JSON matching the exact schema given. No markdown, no preamble, no code fences.";

function buildUserPrompt(extractedText) {
  return `CV TEXT:
${extractedText}
Summarise this candidate. Return ONLY this JSON:
{
"candidateName": string,
"email": string | null,
"phone": string | null,
"currentRole": string | null,
"yearsExperience": number | null,
"verdict": "senior" | "mid" | "junior" | "fresher",
"summary": string,
"strengths": [string, string, string],
"gaps": [string, string, string],
"skills": [string],
"education": [string],
"redFlags": [string]
}`;
}

function buildVisionPdfUserPrompt(filename) {
  return `The candidate's resume is attached as a PDF (including graphics, icons, charts, and layout). Original filename: ${filename}

Read the full document visually and from any extractable text. Summarise this candidate. Return ONLY this JSON:
{
"candidateName": string,
"email": string | null,
"phone": string | null,
"currentRole": string | null,
"yearsExperience": number | null,
"verdict": "senior" | "mid" | "junior" | "fresher",
"summary": string,
"strengths": [string, string, string],
"gaps": [string, string, string],
"skills": [string],
"education": [string],
"redFlags": [string]
}`;
}

module.exports = { SYSTEM_PROMPT, buildUserPrompt, buildVisionPdfUserPrompt };
