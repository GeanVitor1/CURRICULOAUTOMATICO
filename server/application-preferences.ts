import { z } from "zod";
import { languageLevels } from "../shared/application-preferences";

const optionalText = z.string().trim().max(2000).optional();
export const applicationPreferencesSchema = z.object({
  linkedin: z
    .union([
      z.literal(""),
      z
        .string()
        .url()
        .max(500)
        .refine((value) => {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            /^(www\.)?linkedin\.com$/.test(url.hostname) &&
            url.pathname.startsWith("/in/") &&
            !url.username &&
            !url.password
          );
        }, "Informe um link de perfil do LinkedIn válido."),
    ])
    .optional(),
  english: z.enum(languageLevels).or(z.literal("")).optional(),
  spanish: z.enum(languageLevels).or(z.literal("")).optional(),
  englishWork: optionalText,
  currentCompany: optionalText,
  developmentExperience: optionalText,
  dotnetExperience: optionalText,
  cloudExperience: optionalText,
  spanishWork: optionalText,
  gcp: z
    .enum([
      "",
      "Nenhuma",
      "Acadêmica",
      "Uso profissional",
      "Configuração e administração profissional",
    ])
    .optional(),
  dotnet: z
    .enum(["", "Básico", "Intermediário", "Avançado", "Especialista"])
    .optional(),
  accessibility: optionalText,
  confirmation: z.literal(true),
});
