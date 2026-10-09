export const statuses = [
  "Aguardando aprovação",
  "Enviando",
  "Requer ação manual",
  "Enviada",
  "Aguardando resposta",
  "Em entrevista",
  "Teste técnico",
  "Proposta recebida",
  "Rejeitada",
  "Contratada",
  "Falha no envio",
  "Resultado desconhecido",
] as const;
export type Status = (typeof statuses)[number];
export const transitions: Record<Status, Status[]> = {
  "Aguardando aprovação": ["Requer ação manual"],
  Enviando: [],
  "Requer ação manual": ["Enviada"],
  Enviada: [
    "Aguardando resposta",
    "Em entrevista",
    "Teste técnico",
    "Proposta recebida",
    "Rejeitada",
  ],
  "Aguardando resposta": [
    "Em entrevista",
    "Teste técnico",
    "Proposta recebida",
    "Rejeitada",
  ],
  "Em entrevista": ["Teste técnico", "Proposta recebida", "Rejeitada"],
  "Teste técnico": ["Em entrevista", "Proposta recebida", "Rejeitada"],
  "Proposta recebida": ["Contratada", "Rejeitada"],
  Rejeitada: [],
  Contratada: [],
  "Falha no envio": ["Requer ação manual", "Enviada"],
  "Resultado desconhecido": ["Enviada", "Falha no envio"],
};
export type Profile = {
  name: string;
  phone?: string;
  headline: string;
  email: string;
  location: string;
  skills: string[];
  years: number | null;
  level: string;
  salaryMin: number;
  salaryDesired: number;
  github: string;
  portfolio: string;
  availability: string;
  languages: string;
  education: string;
  experience: string;
  confirmed: boolean;
};
export type Filters = {
  remoteAnywhere?: boolean;
  dateKnownOnly?: boolean;
  salaryMax?: number;
  titles: string[];
  skills: string[];
  levels: string[];
  modalities: string[];
  contracts: string[];
  salaryMin: number;
  salaryOnly: boolean;
  maxYears: number;
  minScore: number;
  blockedCompanies: string[];
  ageDays: number;
  locations: string[];
  language: string;
  requiredSkills: string[];
  excludedTerms: string[];
};
export type Routine = {
  enabled: boolean;
  mode: "discovery" | "approval" | "automatic";
  time: string;
  dailyLimit: number;
  minScore: number;
  lastRun: string | null;
  nextRun: string | null;
};
export type Source = {
  id: string;
  type:
    | "greenhouse"
    | "lever"
    | "ashby"
    | "jobicy"
    | "adzuna"
    | "manual"
    | "authorized"
    | "portal";
  company: string;
  board: string;
  enabled: boolean;
  discovery: boolean;
  application: boolean;
  status: string;
  sector?: string;
  country?: string;
  lastCheckedAt?: string | null;
  lastError?: string | null;
};
export type Match = {
  score: number;
  strengths: string[];
  gaps: string[];
  blockers: string[];
  matchedSkills: string[];
  missingSkills: string[];
  radar: boolean;
  explanation: string;
  confidence?: "sufficient" | "insufficient";
  criteria?: { label: string; earned: number; possible: number }[];
  advice?: {
    provider: string;
    model: string;
    explanation: string;
    signature: string;
  };
};
export type Job = {
  id: string;
  title: string;
  company: string;
  source: string;
  url: string;
  description: string;
  location: string;
  modality: string;
  level: string;
  contract: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  salaryPeriod?: string;
  geographicEligibility?: string;
  availability?: "active" | "closed" | "unknown";
  skills: string[];
  requiredSkills: string[];
  requiredYears: number | null;
  publishedAt: string | null;
  discoveredAt: string;
  saved: boolean;
  discarded: boolean;
  origins: { source: string; url: string; id: string }[];
  match: Match;
  application?: Application;
  demo: boolean;
};
export type Event = { at: string; actor: string; message: string };
export type Application = {
  id: string;
  jobId: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  resumeId: string | null;
  receipt: string | null;
  note: string;
  history: Event[];
  mode: string;
  draft?: string;
};
export type Resume = {
  id: string;
  name: string;
  uploadedAt: string;
  skills: string[];
  text: string;
  approved: boolean;
  analysis: string;
  suggestion?: Partial<Profile>;
  targets?: ResumeTarget[];
  targetsMethod?: string;
  targetsVersion?: number;
  targetsMessage?: string;
  targetsConfirmed?: boolean;
  targetTitles?: string[];
};
export type ResumeTarget = {
  title: string;
  reason: string;
  evidence: string;
  caution: string;
};
export type Notice = {
  id: string;
  title: string;
  message: string;
  at: string;
  read: boolean;
};
export type Run = {
  id: string;
  at: string;
  status: string;
  discovered: number;
  processed: number;
  errors: string[];
  message: string;
  searchSuggestions?: string[];
};
export type Workspace = {
  interviewDraft?: {
    step: number;
    completed: boolean;
    answers: InterviewAnswers;
  };
  interview?: {
    step: number;
    completed: boolean;
    answers: InterviewAnswers;
  };
  guide?: {
    step: number;
    completed: boolean;
    dismissed: boolean;
    active: boolean;
  };
  jobCounts?: { total: number; saved: number; recommended: number };
  resumeDraft?: {
    step: number;
    data: {
      name: string;
      email: string;
      location: string;
      headline: string;
      education: string;
      experience: string;
      skills: string;
      languages: string;
    };
  };
  onboarding?: {
    step: number;
    completed: boolean;
    answers: {
      goal: string;
      location: string;
      resumeChoice: "upload" | "build" | "later" | "";
      experience: string;
      modalities: string[];
      contracts: string[];
      salaryMin: number;
    };
  };
  intelligence?: {
    provider: string;
    model: string;
    enabled: boolean;
    keyConfigured: boolean;
    consent?: boolean;
    health?: {
      status: string;
      requests: number;
      cacheHits: number;
      failures: number;
      tokens: number;
      lastSuccess: string | null;
      lastFailure: string | null;
      lastError?: string;
    };
    status?: string;
    privacyUrl?: string;
    zenConfigured?: boolean;
    geminiConfigured?: boolean;
    geminiModel?: string;
    recommendedModel?: string;
  };
  profile: Profile;
  filters: Filters;
  routine: Routine;
  sources: Source[];
  jobs: Job[];
  applications: Application[];
  resumes: Resume[];
  notices: Notice[];
  runs: Run[];
  demo: boolean;
  infrastructure: {
    database: string;
    queue: string;
    automatic: boolean;
    worker: boolean;
  };
  searchProfiles: {
    id: string;
    name: string;
    filters: Filters;
    mode: Routine["mode"];
  }[];
};
export type InterviewAnswers = {
  resumeId: string;
  phone?: string;
  titles: string[];
  modalities: string[];
  city: string;
  sameCityOnly: boolean;
  salaryMin: number;
  salaryMax: number;
  includeUnknownSalary: boolean;
  ageDays: number;
  contracts: string[];
  sites: string[];
  dailyLimit: number;
};
export const defaultProfile: Profile = {
  name: "",
  headline: "",
  email: "",
  location: "",
  skills: [],
  years: null,
  level: "Não especificado",
  salaryMin: 0,
  salaryDesired: 0,
  github: "",
  portfolio: "",
  availability: "",
  languages: "",
  education: "",
  experience: "",
  confirmed: false,
};
export const defaultFilters: Filters = {
  titles: [],
  skills: [],
  levels: [],
  modalities: [],
  contracts: [],
  salaryMin: 0,
  salaryOnly: false,
  maxYears: 50,
  minScore: 0,
  blockedCompanies: [],
  ageDays: 30,
  locations: [],
  language: "",
  requiredSkills: [],
  excludedTerms: [],
};
export const defaultRoutine: Routine = {
  enabled: false,
  mode: "discovery",
  time: "08:00",
  dailyLimit: 10,
  minScore: 80,
  lastRun: null,
  nextRun: null,
};
