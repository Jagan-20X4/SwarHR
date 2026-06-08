export interface ApplicationRecord {
  applicationId?: number;
  jobId: string;
  appliedAt: string;
  interviewScheduledAt?: string;
  interviewCompletedAt?: string;
  interviewCompletionStatus?: string;
  reattemptRequestStatus?: string;
  transcript?: TranscriptLine[];
  analysis?: AnalysisResult;
  hrDecisionStatus?: string;
  hrRemarks?: string;
}

export interface TranscriptLine {
  role: string;
  text: string;
}

export interface AnalysisResult {
  summary?: string;
  tech?: number | null;
  comm?: number | null;
  rec?: string;
  strengths?: string[];
  areas?: string[];
  noTranscript?: boolean;
  pendingManualGenerate?: boolean;
}

export interface CvFile {
  name?: string;
  mime?: string;
  ext?: string;
  size?: number;
  dataUrl?: string;
  downloadUrl?: string;
  cvText?: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  password?: string;
  cv?: string;
  cvFile?: CvFile;
  status: string;
  jobId?: string;
  lang?: string;
  consent?: boolean;
  consentAt?: string;
  purposes?: string[];
  applicationHistory: ApplicationRecord[];
  transcript?: TranscriptLine[];
  analysis?: AnalysisResult;
  remarks?: string;
  grievances?: unknown[];
  fromTalentPool?: boolean;
}

export interface Job {
  id: string;
  title: string;
  designation?: string;
  location?: string;
  description: string;
  requirements?: string;
  userStatus?: string;
  coolingDaysLeft?: number;
  interviewQuestions?: InterviewQuestion[];
}

export interface InterviewQuestion {
  id?: number;
  question: string;
  questionType?: string;
  questionPhase?: string;
  displayOrder?: number;
}

export interface AppMeta {
  companyName?: string;
  coolingMonths?: number;
  maxCvMb?: number;
  dpo?: { name: string; email: string; phone: string };
  dataCategories?: string[];
}

export interface TalentPoolEntry {
  id?: string;
  name: string;
  email: string;
  cvText?: string;
  cvFile?: CvFile;
  submittedAt?: string;
  mappedToJobs?: { jobId: string; mappedAt: string; mappedBy: string }[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target?: string;
  details?: string | Record<string, unknown>;
}
