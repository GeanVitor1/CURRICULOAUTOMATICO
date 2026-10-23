import type { Profile } from "../shared/types";
import { candidateDetailsReady } from "../shared/candidate-details";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function candidateAnswer(
  label: string,
  profile: Profile,
): string | undefined {
  const key = normalize(label).replace(/\s+([?!])/g,'$1').replace(/[ *:]+$/g, "");
  const preferences = profile.applicationPreferences;
  if (profile.confirmed && preferences?.confirmedAt) {
    if (
      key === "current company" ||
      key ===
        "confirm the name of the company where you work/ confirme o nome da empresa em que voce trabalha atualmente"
    )
      return preferences.currentCompany || undefined;
    if (key === "for how long have you worked with .net?")
      return preferences.dotnetExperience || undefined;
    if (key === "how long have you worked in development?")
      return preferences.developmentExperience || undefined;
    if (key === "do you have experience with aws, azure or google cloud?")
      return preferences.cloudExperience || undefined;
    if (
      key ===
      "[en] qual e o seu nivel de confianca ao se comunicar e colaborar em um ambiente de trabalho onde se fala ingles?"
    )
      return preferences.english || undefined;
    if (
      key ===
      "[es] qual e o seu nivel de confianca ao se comunicar e colaborar em um ambiente de trabalho onde se fala espanhol?"
    )
      return preferences.spanish || undefined;
    if (
      key ===
      "voce se sente confortavel trabalhando em um ambiente onde se fala ingles?"
    )
      return preferences.englishWork || undefined;
    if (key === "como voce avalia seu conhecimento com .net?")
      return preferences.dotnet || undefined;
    if (key === "qual sua experiencia com cloud gcp?") {
      const options: Record<string, string> = {
        Nenhuma: "Não tive contato",
        Acadêmica: "Contato acadêmico",
        "Uso profissional": "Contato nível usuário",
        "Configuração e administração profissional":
          "Contato configurando e/ou usando ferramentas",
      };
      return preferences.gcp ? options[preferences.gcp] : undefined;
    }
    if (
      key ===
      "voce precisa de algum tipo de acessibilidade para participar do processo seletivo e/ou no seu dia-a-dia?"
    )
      return preferences.accessibility || undefined;
    if (
      /^(linkedin|linkedin url|linkedin profile|linkedin profile url|link do linkedin)$/.test(
        key,
      )
    )
      return preferences.linkedin || undefined;
    if (
      /^(nivel de ingles|qual (?:e )?(?:o )?seu nivel de ingles\??|english level)$/.test(
        key,
      )
    )
      return preferences.english || undefined;
    if (
      /^(nivel de espanhol|qual (?:e )?(?:o )?seu nivel de espanhol\??|spanish level)$/.test(
        key,
      )
    )
      return preferences.spanish || undefined;
    if (
      /^(como voce se sente para trabalhar em ingles\??|how comfortable are you working in english\??)$/.test(
        key,
      )
    )
      return preferences.englishWork || undefined;
    if (/^(como voce se sente para trabalhar em espanhol\??)$/.test(key))
      return preferences.spanishWork || undefined;
    if (/^(seu nivel em \.net|nivel em \.net)$/.test(key))
      return preferences.dotnet || undefined;
    // Accessibility and employer-specific declarations require an exact reviewed answer.
  }
  // Exact personal fields only. Qualifications and declarations are never inferred from a CV.
  if (/^(email|e-mail|email address|endereco de e-mail)$/.test(key))
    return profile.email || undefined;
  if (/^(nome completo|full name|name|nome)$/.test(key))
    return profile.name || undefined;
  if (/^(primeiro nome|first name)$/.test(key))
    return profile.name.split(/\s+/)[0] || undefined;
  if (/^(sobrenome|last name)$/.test(key))
    return profile.name.split(/\s+/).slice(1).join(" ") || undefined;
  if (/^(github|github url)$/.test(key)) return profile.github || undefined;
  if (
    /^(telefone|celular|phone|phone number|mobile phone number|numero de telefone|numero de telefone celular)$/.test(
      key,
    )
  )
    return profile.phone || undefined;
  if (/^(cidade|city)$/.test(key))
    return profile.location.split(",")[0].trim() || undefined;
  if (/^(cargo pretendido|headline|titulo profissional)$/.test(key))
    return profile.confirmed ? profile.headline || undefined : undefined;
  // A state explicitly present in the confirmed location is an existing fact.
  if (/^(estado\/regiao|estado|state\/region)$/.test(key))
    return profile.confirmed ? profile.location.match(/,\s*([A-Z]{2})\s*$/)?.[1] : undefined;
  if (
    /^(cidade e estado|cidade\/estado|localizacao atual|current location)$/.test(
      key,
    )
  )
    return profile.location || undefined;
  if (/^(portfolio|portfolio url|website|site pessoal)$/.test(key))
    return profile.portfolio || undefined;
  if (profile.confirmed && candidateDetailsReady(profile)) {
    if (key === "what is your salary expectation? only the numeric value (no currency, text, or benefits)/ qual e a sua pretensao salarial? apenas o valor numerico (sem moeda, texto ou beneficios)." && profile.salaryDesired > 0)
      return String(profile.salaryDesired);
    if (
      /^qual sua expectativa salarial como prestador\(a\)\s*\??$/.test(key) &&
      profile.acceptsPj && profile.salaryDesired > 0
    ) return String(profile.salaryDesired);
    if (
      /^(qual (?:e )?(?:a )?sua remuneracao atual \(ou ultima\) \+ beneficios\??|remuneracao atual ou ultima e beneficios|current or last compensation and benefits)$/.test(
        key,
      )
    )
      return profile.compensationDisclosure === "prefer_not_to_say"
        ? "Prefiro não informar"
        : profile.currentCompensation;
    if (
      /^(voce tem interesse em atuar no regime pj\??|aceita contratacao pj\??|interesse em contratacao pj)$/.test(
        key,
      )
    )
      return profile.acceptsPj ? "Sim" : "Não";
    if (
      /^(pretensao salarial(?: mensal| por mes)?(?: \(r\$\))?|qual (?:e )?(?:a )?sua pretensao salarial(?: mensal| por mes)?\??|monthly salary expectation|expected monthly salary)$/.test(
        key,
      ) &&
      profile.salaryDesired > 0
    )
      return String(profile.salaryDesired);
    if (
      /^(anos de experiencia|tempo de experiencia em anos|quantos anos de experiencia (?:profissional )?(?:voce (?:tem|possui))\??|years of (?:professional )?experience)$/.test(
        key,
      )
    )
      return String(profile.years);
  }
  return undefined;
}
