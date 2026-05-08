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

const FIT_SYSTEM_PROMPT =
  `${SYSTEM_PROMPT} Score fit strictly against the JOB POSTING below (requirements, skills, experience). overallFitScore 0-100 reflects alignment with this role. Sub-scores technicalScore, experienceScore, educationScore, cultureScore are each 0-5 (decimals allowed for cultureScore). fitSummary must explain match/mismatch with the role in 3-6 sentences.`;

function escapeJobField(s) {
  return String(s || "").slice(0, 12000);
}

function buildJobPostingBlock(job) {
  const j = job || {};
  return `JOB POSTING (evaluate the candidate against this role):
Company: ${escapeJobField(j.company_name)}
Job title: ${escapeJobField(j.title)}
Designation: ${escapeJobField(j.designation)}
Location: ${escapeJobField(j.location)}
Description & requirements:
${escapeJobField(j.description)}`;
}

function buildUserPromptWithJob(extractedText, job) {
  return `${buildJobPostingBlock(job)}

CV TEXT:
${extractedText}

Return ONLY this JSON:
{
"candidateName": string,
"email": string | null,
"phone": string | null,
"currentRole": string | null,
"yearsExperience": number | null,
"verdict": "senior" | "mid" | "junior" | "fresher",
"summary": string,
"fitSummary": string,
"overallFitScore": number,
"technicalScore": number,
"experienceScore": number,
"educationScore": number,
"cultureScore": number,
"strengths": [string, string, string],
"gaps": [string, string, string],
"skills": [string],
"education": [string],
"redFlags": [string]
}`;
}

function buildVisionPdfUserPromptWithJob(filename, job) {
  return `The candidate's resume is attached as a PDF (including graphics, icons, charts, and layout). Original filename: ${filename}

${buildJobPostingBlock(job)}

Read the full document visually and from any extractable text. Evaluate fit for the JOB POSTING. Return ONLY this JSON:
{
"candidateName": string,
"email": string | null,
"phone": string | null,
"currentRole": string | null,
"yearsExperience": number | null,
"verdict": "senior" | "mid" | "junior" | "fresher",
"summary": string,
"fitSummary": string,
"overallFitScore": number,
"technicalScore": number,
"experienceScore": number,
"educationScore": number,
"cultureScore": number,
"strengths": [string, string, string],
"gaps": [string, string, string],
"skills": [string],
"education": [string],
"redFlags": [string]
}`;
}

function buildGenerateJdUserPrompt(roleTitle) {
  const t = String(roleTitle || "").trim().slice(0, 200);
  return `Generate a concise job posting for the role "${t}" at Indira IVF (healthcare / IVF chain). Default work location Mumbai unless role implies otherwise.

Return ONLY valid JSON (no markdown):
{
  "title": string,
  "designation": string,
  "description": string
}

description: 2 short paragraphs — role summary + bullet-style requirements (plain text, use line breaks or hyphens, max ~350 words). Use professional HR tone.`;
}

module.exports = {
  SYSTEM_PROMPT,
  FIT_SYSTEM_PROMPT,
  buildUserPrompt,
  buildVisionPdfUserPrompt,
  buildUserPromptWithJob,
  buildVisionPdfUserPromptWithJob,
  buildGenerateJdUserPrompt,
};
