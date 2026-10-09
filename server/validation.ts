import { z } from "zod";
import { statuses } from "../shared/types";
const line = z.string().trim().max(200);
const list = z.array(line).max(60);
const link = z.union([
  z.literal(""),
  z.url().refine((v) => /^https?:\/\//.test(v), "Use http ou https"),
]);
export const profileSchema = z.object({
  name: line,
  phone: z.string().trim().max(30).optional(),
  headline: line,
  email: z.union([z.literal(""), z.email()]),
  location: line,
  skills: list,
  years: z.number().min(0).max(70).nullable(),
  level: line,
  salaryMin: z.number().min(0).max(10000000),
  salaryDesired: z.number().min(0).max(10000000),
  github: link,
  portfolio: link,
  availability: line,
  languages: line,
  education: z.string().max(5000),
  experience: z.string().max(10000),
  confirmed: z.boolean(),
});
export const filtersSchema = z
  .object({
    remoteAnywhere: z.boolean().optional(),
    dateKnownOnly: z.boolean().optional(),
    salaryMax: z.number().min(0).max(10000000).optional(),
    titles: list,
    skills: list,
    levels: list,
    modalities: list,
    contracts: list,
    salaryMin: z.number().min(0).max(10000000),
    salaryOnly: z.boolean(),
    maxYears: z.number().min(0).max(70),
    minScore: z.number().min(0).max(100),
    blockedCompanies: list,
    ageDays: z.number().int().min(1).max(365),
    locations: list,
    language: line,
    requiredSkills: list,
    excludedTerms: list,
  })
  .refine((f) => !f.salaryMax || f.salaryMax >= f.salaryMin, {
    path: ["salaryMax"],
    message: "O salário máximo precisa ser igual ou maior que o mínimo.",
  });
export const routineSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["discovery", "approval", "automatic"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  dailyLimit: z.number().int().min(1).max(50),
  minScore: z.number().min(0).max(100),
});
export const sourceSchema = z
  .object({
    type: z.enum([
      "greenhouse",
      "lever",
      "ashby",
      "jobicy",
      "adzuna",
      "authorized",
      "portal",
    ]),
    company: line.min(1),
    board: z.string().trim().max(200).default("adapter"),
    enabled: z.boolean().default(true),
    country: z
      .union([z.literal(""), z.string().regex(/^[a-z]{2}$/)])
      .optional(),
    sector: line.optional(),
  })
  .refine(
    (source) =>
      source.type === "adzuna"
        ? source.board.length > 0
        : /^[a-zA-Z0-9_-]{1,100}$/.test(source.board),
    {
      path: ["board"],
      message:
        "Use o termo da busca ou o identificador público válido da empresa.",
    },
  );
export const jobSchema = z
  .object({
    title: line.min(1),
    company: line.min(1),
    url: link,
    description: z.string().min(20).max(60000),
    location: line,
    modality: line,
    level: line,
    contract: line,
    salaryMin: z.number().min(0).nullable(),
    salaryMax: z.number().min(0).nullable(),
    currency: z.enum(["BRL", "USD", "EUR"]),
    skills: list,
    requiredSkills: list,
    requiredYears: z.number().min(0).max(70).nullable(),
  })
  .refine(
    (j) =>
      j.salaryMin === null ||
      j.salaryMax === null ||
      j.salaryMax >= j.salaryMin,
    "Faixa salarial inválida",
  );
export const statusSchema = z.object({
  status: z.enum(statuses),
  confirmation: z.boolean().default(false),
  note: z.string().max(5000).optional(),
});
