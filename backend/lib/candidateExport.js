const REPORT_HEADERS = [
  "Candidate Name",
  "Email ID",
  "Mobile Number",
  "Qualification",
  "Current City",
  "Preferred City 1",
  "Preferred City 2",
  "Preferred City 3",
  "Experience (Years)",
  "Current Annual CTC",
  "Current Employer",
  "Source",
  "Application Type",
  "Date of Application",
  "Job Title",
  "Application Status",
  "Cooling Period Applicable (Yes/No)",
  "Eligible Reapply Date",
  "AI Interview Status",
  "Interview Attempt Count",
  "Interview Scheduled Date",
  "Interview Completion Date",
  "Interview Duration (mins)",
  "Overall AI Score (%)",
  "Communication Score",
  "Role Fit Score",
  "Behavioral Score",
  "AI Recommendation",
  "Interview Outcome",
  "Final Decision",
  "Decision Date",
  "HR SPOC Name",
];

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatReportDate(isoOrDate) {
  if (!isoOrDate) return "";
  try {
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return "";
  }
}

function parseAiJson(row) {
  if (row.ai_analysis_json == null) return null;
  if (typeof row.ai_analysis_json === "object") return row.ai_analysis_json;
  try {
    return JSON.parse(row.ai_analysis_json);
  } catch {
    return null;
  }
}

function interviewIsDone(row) {
  const ic = row.interview_completion_status || "";
  return (
    ic === "completed" ||
    Boolean(row.interview_completed_at) ||
    Number(row.has_transcript || 0) > 0 ||
    Number(row.has_voice_interview || 0) > 0
  );
}

function mapAiRecommendation(rec) {
  const key = String(rec || "").trim();
  const m = {
    "Strong Hire": "Strong Fit",
    Hire: "Fit",
    "Weak Hire": "Borderline",
    "No Hire": "Not Fit",
  };
  return m[key] || "";
}

function mapAiInterviewStatus(row) {
  const ic = row.interview_completion_status || "not_started";
  const rs = row.reattempt_request_status || "none";
  const attempts = Number(row.attempt_count || 0);

  if (rs === "pending" || rs === "approved") return "Reattempt Allowed";
  if (ic === "completed" || (row.interview_completed_at && ic !== "incomplete_technical")) {
    return attempts > 1 ? "Reattempt Completed" : "Completed";
  }
  if (ic === "in_progress") return "In Progress";
  if (ic === "incomplete_technical") return "Technical Failure";
  if (row.interview_scheduled_at && !interviewIsDone(row)) {
    return "Missed / Not Attempted";
  }
  if (row.interview_scheduled_at) return "Scheduled";
  return "Not Scheduled";
}

function mapInterviewOutcome(row) {
  const ic = row.interview_completion_status || "not_started";
  if (ic === "completed" || row.interview_completed_at) return "Completed";
  if (ic === "incomplete_technical") return "Technical Failure";
  if (ic === "in_progress") return "In Progress";
  if (row.interview_scheduled_at) return "Not Attempted";
  return "";
}

function mapApplicationStatus(row) {
  const hr = row.hr_decision_status;
  const cs = row.candidate_status;
  if (hr === "REJECTED" || cs === "REJECTED") return "Rejected";
  if (hr === "SHORTLISTED" || cs === "SHORTLISTED") return "Selected";
  if (row.from_talent_pool) return "Talent Pool";
  return "";
}

function mapFinalDecision(row) {
  const hr = row.hr_decision_status;
  const cs = row.candidate_status;
  if (hr === "SHORTLISTED" || cs === "SHORTLISTED") return "Selected";
  if (hr === "REJECTED" || cs === "REJECTED") return "Rejected";
  if (interviewIsDone(row)) return "On Hold";
  return "";
}

function coolingInfo(row, coolingMonths) {
  const cm = typeof coolingMonths === "number" ? coolingMonths : 3;
  if (!row.interview_completed_at) {
    return { applicable: "No", eligibleDate: "" };
  }
  const completed = new Date(row.interview_completed_at);
  const eligible = new Date(completed);
  eligible.setMonth(eligible.getMonth() + cm);
  const now = new Date();
  return {
    applicable: now < eligible ? "Yes" : "No",
    eligibleDate: formatReportDate(eligible),
  };
}

function scorePercent(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 10));
}

function overallScorePercent(tech, comm) {
  const t = tech != null && tech !== "" ? Number(tech) : null;
  const c = comm != null && comm !== "" ? Number(comm) : null;
  if (t == null && c == null) return "";
  if (t != null && c != null) return String(Math.round(((t + c) / 2) * 10));
  return scorePercent(t != null ? t : c);
}

function rowToReportCells(row, coolingMonths) {
  const fromTalentPool = Boolean(row.from_talent_pool);
  const pathA = !fromTalentPool;

  const profile = pathA
    ? {
        phone: "",
        qualification: "",
        currentCity: "",
        preferredCity1: "",
        preferredCity2: "",
        preferredCity3: "",
        experience: "",
        ctc: "",
        employer: "",
        source: "Careers Website",
        applicationType: "Active Job",
      }
    : {
        phone: row.tp_phone || "",
        qualification: row.tp_qualification || "",
        currentCity: row.tp_location || "",
        preferredCity1: row.tp_preferred_city_1 || "",
        preferredCity2: row.tp_preferred_city_2 || "",
        preferredCity3: row.tp_preferred_city_3 || "",
        experience:
          row.tp_experience_years != null ? String(row.tp_experience_years) : "",
        ctc: row.tp_current_ctc || "",
        employer: row.tp_current_employer || "",
        source: row.tp_source || "",
        applicationType: row.job_id ? "Active Job" : "Talent Pool",
      };

  const appAi = parseAiJson(row);
  const tech = appAi?.tech ?? appAi?.tech_score ?? row.tech_score ?? null;
  const comm = appAi?.comm ?? appAi?.comm_score ?? row.comm_score ?? null;
  const rec = appAi?.rec ?? appAi?.recommendation_label ?? row.recommendation_label ?? "";

  const cooling = coolingInfo(row, coolingMonths);
  const done = interviewIsDone(row);
  const hasDecision =
    row.hr_decision_status === "SHORTLISTED" ||
    row.hr_decision_status === "REJECTED";

  const durationMins =
    row.total_duration_seconds != null && Number(row.total_duration_seconds) > 0
      ? String(Math.round(Number(row.total_duration_seconds) / 60))
      : "";

  return [
    row.candidate_name || "",
    row.candidate_email || "",
    profile.phone,
    profile.qualification,
    profile.currentCity,
    profile.preferredCity1,
    profile.preferredCity2,
    profile.preferredCity3,
    profile.experience,
    profile.ctc,
    profile.employer,
    profile.source,
    profile.applicationType,
    formatReportDate(row.applied_at),
    row.job_title || "",
    mapApplicationStatus(row),
    cooling.applicable,
    cooling.eligibleDate,
    mapAiInterviewStatus(row),
    row.attempt_count != null ? String(row.attempt_count) : "0",
    formatReportDate(row.interview_scheduled_at),
    formatReportDate(row.interview_completed_at),
    durationMins,
    overallScorePercent(tech, comm),
    scorePercent(comm),
    scorePercent(tech),
    "",
    mapAiRecommendation(rec),
    mapInterviewOutcome(row),
    mapFinalDecision(row),
    hasDecision ? formatReportDate(row.hr_decision_at) : "",
    done && hasDecision ? row.hr_spoc_name || "" : "",
  ];
}

function guestTalentPoolRowToReportCells(row) {
  const coolingText = (row.tp_cooling_period || "").trim();
  return [
    row.candidate_name || "",
    row.candidate_email || "",
    row.tp_phone || "",
    row.tp_qualification || "",
    row.tp_location || "",
    row.tp_preferred_city_1 || "",
    row.tp_preferred_city_2 || "",
    row.tp_preferred_city_3 || "",
    row.tp_experience_years != null ? String(row.tp_experience_years) : "",
    row.tp_current_ctc || "",
    row.tp_current_employer || "",
    row.tp_source || "",
    "Talent Pool",
    formatReportDate(row.applied_at),
    row.job_title || "",
    "Talent Pool",
    coolingText ? "Yes" : "No",
    "",
    "Not Scheduled",
    "0",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
}

function buildCandidateExportCsv({ applicationRows = [], guestRows = [], coolingMonths } = {}) {
  const lines = [REPORT_HEADERS.map(csvEscape).join(",")];
  for (const row of applicationRows) {
    lines.push(rowToReportCells(row, coolingMonths).map(csvEscape).join(","));
  }
  for (const row of guestRows) {
    lines.push(guestTalentPoolRowToReportCells(row).map(csvEscape).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function shouldIncludeGuestTalentPoolExport(status) {
  if (!status || status === "ALL") return true;
  return status === "REGISTERED";
}

module.exports = {
  REPORT_HEADERS,
  buildCandidateExportCsv,
  shouldIncludeGuestTalentPoolExport,
  csvEscape,
};
