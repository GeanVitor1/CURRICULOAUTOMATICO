import { RequestError } from "./errors";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { candidatePortals, portals } from "../shared/portals";
import { defaultFilters, type Workspace } from "../shared/types";
import { nextExecution, parseResume } from "./engine";
import { automaticPortals } from "./connectors";
import { applyResumeProfile } from "./resume-state";

export const interviewSchema = z.object({
  step: z.number().int().min(0).max(5),
  complete: z.boolean().default(false),
  start: z.enum(["save", "automatic", "prepare"]).default("save"),
  answers: z.object({
    resumeId: z.string().min(1).max(100),
    phone: z
      .string()
      .trim()
      .max(30)
      .refine(
        (value) =>
          !value ||
          (/^[+()\d\s-]+$/.test(value) &&
            value.replace(/\D/g, "").length >= 10 &&
            value.replace(/\D/g, "").length <= 15),
        "Informe um telefone com DDD válido.",
      )
      .optional(),
    titles: z.array(z.string().trim().min(2).max(100)).max(8),
    modalities: z.array(z.enum(["Remoto", "Presencial", "Híbrido"])).max(3),
    city: z.string().trim().max(200),
    sameCityOnly: z.boolean(),
    salaryMin: z.number().min(0).max(10000000),
    salaryMax: z.number().min(0).max(10000000),
    includeUnknownSalary: z.boolean(),
    ageDays: z.number().int().min(1).max(365),
    contracts: z
      .array(z.enum(["CLT", "PJ", "Estágio", "Aprendiz", "Temporário"]))
      .max(5),
    sites: z.array(z.enum(candidatePortals)).max(4),
    dailyLimit: z.number().int().min(1).max(50),
  }),
});
export function applyInterview(
  w: Workspace,
  body: z.infer<typeof interviewSchema>,
  availableSites: string[] = automaticPortals(),
) {
  const a = body.answers;
  const resume = w.resumes.find((resume) => resume.id === a.resumeId);
  if (!resume)
    throw new RequestError(
      "Envie seu currículo antes de responder às preferências.",
    );
  if (!body.complete) {
    const draft = { step: body.step, completed: false, answers: a };
    if (w.interview?.completed) w.interviewDraft = draft;
    else w.interview = draft;
    return;
  }
  if (!a.titles.length || !a.modalities.length || !a.sites.length)
    throw new RequestError(
      "Escolha os cargos, a modalidade e pelo menos um site.",
    );
  if (
    a.modalities.some((modality) => modality !== "Remoto") &&
    a.sameCityOnly &&
    !a.city
  )
    throw new RequestError(
      "Informe sua cidade para vagas presenciais ou híbridas.",
    );
  if (a.salaryMax && a.salaryMax < a.salaryMin)
    throw new RequestError(
      "O salário máximo precisa ser igual ou maior que o mínimo.",
    );
  const selected = [...new Set(a.sites)];
  if (
    body.start === "automatic" &&
    !selected.some((site) => availableSites.includes(site))
  )
    throw new RequestError(
      "O envio automático ainda não está conectado aos sites escolhidos. Você pode salvar suas preferências ou iniciar apenas a busca e preparação.",
    );
  applyResumeProfile(w, resume);
  w.profile.location = a.city;
  if (a.phone !== undefined) w.profile.phone = a.phone;
  w.profile.salaryMin = a.salaryMin;
  w.profile.confirmed = true;
  resume.approved = true;
  w.resumes.forEach((r) => {
    r.targetsConfirmed = r.id === resume.id;
  });
  resume.targetTitles = [...a.titles];
  w.filters = {
    ...structuredClone(defaultFilters),
    titles: [...a.titles],
    modalities: [...a.modalities],
    contracts: [...a.contracts],
    salaryMin: a.salaryMin,
    salaryMax: a.salaryMax,
    salaryOnly: !a.includeUnknownSalary,
    ageDays: a.ageDays,
    dateKnownOnly: a.ageDays < 365,
    locations: a.sameCityOnly && a.city ? [a.city] : [],
    remoteAnywhere: true,
    blockedCompanies: w.filters.blockedCompanies,
  };
  w.sources.forEach((source) => {
    if (source.type !== "authorized")
      source.enabled =
        source.type === "portal" &&
        selected.includes(source.board as (typeof selected)[number]);
  });
  for (const site of selected)
    if (
      !w.sources.some(
        (source) => source.type === "portal" && source.board === site,
      )
    )
      w.sources.push({
        id: randomUUID(),
        type: "portal",
        board: site,
        company: portals[site].name,
        enabled: true,
        discovery: true,
        application: availableSites.includes(site),
        status: "Aguardando busca",
      });
  w.interview = { step: 5, completed: true, answers: a };
  delete w.interviewDraft;
  w.onboarding = {
    step: 5,
    completed: true,
    answers: {
      goal: a.titles.join(", "),
      location: a.city,
      resumeChoice: "upload",
      experience: w.profile.experience,
      modalities: a.modalities,
      contracts: a.contracts,
      salaryMin: a.salaryMin,
    },
  };
  w.guide = { step: 0, completed: true, active: false, dismissed: true };
  w.routine = {
    ...w.routine,
    enabled: body.start !== "save",
    mode: body.start === "automatic" ? "automatic" : "approval",
    dailyLimit: a.dailyLimit,
    minScore: 70,
    nextRun: body.start === "save" ? null : nextExecution(w.routine.time),
  };
}
