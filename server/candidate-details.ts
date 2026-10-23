import { z } from "zod";
import { validCandidatePhone } from "../shared/candidate-details";
import type { Workspace } from "../shared/types";

export const candidateDetailsSchema = z
  .object({
    acceptsPj: z.boolean(),
    compensationDisclosure: z.enum(["inform", "prefer_not_to_say"]),
    currentCompensation: z.string().trim().max(1000).optional(),
    phone: z
      .string()
      .trim()
      .max(30)
      .refine(validCandidatePhone, "Informe um telefone com DDD válido."),
    location: z.string().trim().min(3, "Informe sua cidade e estado.").max(200),
    years: z.number().min(0).max(70),
    salaryDesired: z.number().min(0).max(10000000),
    confirmation: z.literal(true),
  })
  .refine(
    (input) =>
      input.compensationDisclosure !== "inform" ||
      !!input.currentCompensation?.trim(),
    {
      path: ["currentCompensation"],
      message:
        "Informe sua remuneração atual ou última e benefícios, ou escolha prefiro não informar.",
    },
  );

export function applyCandidateDetails(
  w: Workspace,
  input: z.infer<typeof candidateDetailsSchema>,
) {
  w.profile.phone = input.phone;
  w.profile.location = input.location;
  w.profile.years = input.years;
  w.profile.salaryDesired = input.salaryDesired;
  w.profile.acceptsPj = input.acceptsPj;
  w.profile.compensationDisclosure = input.compensationDisclosure;
  if (input.compensationDisclosure === "inform")
    w.profile.currentCompensation = input.currentCompensation;
  else delete w.profile.currentCompensation;
  w.profile.candidateDetailsConfirmedAt = new Date().toISOString();
  // Update existing interview defaults without approving a resume or starting a routine.
  for (const interview of [w.interview, w.interviewDraft]) {
    if (interview) {
      interview.answers.phone = input.phone;
      interview.answers.city = input.location;
    }
  }
}
