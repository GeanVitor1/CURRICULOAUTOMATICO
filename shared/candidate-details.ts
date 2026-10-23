import type { Profile } from "./types";

export function validCandidatePhone(value: string | undefined) {
  return (
    !!value &&
    /^[+()\d\s-]+$/.test(value) &&
    value.replace(/\D/g, "").length >= 10 &&
    value.replace(/\D/g, "").length <= 15
  );
}

export function missingCandidateDetails(profile: Profile): string[] {
  const missing: string[] = [];
  if (typeof profile.acceptsPj !== "boolean")
    missing.push("interesse em contratação PJ");
  if (
    profile.compensationDisclosure !== "prefer_not_to_say" &&
    (profile.compensationDisclosure !== "inform" ||
      !profile.currentCompensation?.trim())
  )
    missing.push(
      "remuneração atual ou última e benefícios, ou preferência por não informar",
    );
  if (!validCandidatePhone(profile.phone)) missing.push("telefone com DDD");
  if (profile.location.trim().length < 3) missing.push("cidade e estado");
  if (
    profile.years === null ||
    !Number.isFinite(profile.years) ||
    profile.years < 0 ||
    profile.years > 70
  )
    missing.push("tempo de experiência");
  if (
    !Number.isFinite(profile.salaryDesired) ||
    profile.salaryDesired < 0 ||
    profile.salaryDesired > 10000000
  )
    missing.push("pretensão salarial");
  if (
    !profile.candidateDetailsConfirmedAt ||
    !Number.isFinite(Date.parse(profile.candidateDetailsConfirmedAt))
  )
    missing.push("confirmação dos dados básicos");
  return missing;
}

export const candidateDetailsReady = (profile: Profile) =>
  missingCandidateDetails(profile).length === 0;
