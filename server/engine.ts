import { createHash } from "node:crypto";
import type { Filters, Job, Match, Profile } from "../shared/types";
import { evidenceLines } from "./professional-evidence";
import { resumeSections } from "./resume-sections";
import { isJobUrl, isPortalId } from "../shared/portals";
import type { Workspace } from "../shared/types";
import { expandSearchTitles } from "./job-identity";
import {mandatoryTechnicalSkills,mandatorySkillGroups,mandatoryRequirementLines} from './mandatory-requirements';
export function matchesSelectedSites(job: Job, workspace: Workspace): boolean {
  return (
    (workspace.routine.destinationPolicy === 'official' && /^https:\/\/jobs\.quickin\.io\/[a-z0-9_-]+\/jobs\/[a-f0-9]{24}$/i.test(job.url) && !!job.destinations?.some(d=>d.platform==='quickin'&&d.publicationUrl===job.url&&d.url===`${job.url}/apply`&&d.company===job.company&&d.state==='verified'&&d.formFound&&Date.parse(d.expiresAt)>Date.now())) ||
    (workspace.routine.destinationPolicy === 'official' && job.origins.some(o=>o.source==='company') && !!job.destinations?.some(d=>d.platform==='company'&&d.state==='verified'&&d.formFound&&Date.parse(d.expiresAt)>Date.now())) ||
    (!!job.emailDestination && job.emailDestination.publicationUrl === job.url && Date.parse(job.emailDestination.expiresAt) > Date.now()) ||
    !workspace.interview?.completed ||
    workspace.interview.answers.sites.some(
      (site) =>
        isPortalId(site) &&
        [job.url, ...job.origins.map((o) => o.url)].some((url) =>
          isJobUrl(site, url),
        ),
    ) ||
    job.origins.some((origin) =>
      [
        "greenhouse",
        "lever",
        "ashby",
        "smartrecruiters",
        "quickin",
        "jobicy",
        "adzuna",
        "jooble",
      ].includes(origin.source),
    )
  );
}
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
/** A missing field in a discovery snippet can justify research, never an application. */
export function eligibleForDestinationResearch(job: Job, workspace: Workspace) {
  const assessment=analyze(job,workspace.profile,workspace.filters);
  // Another public page cannot supply qualifications missing from the candidate.
  if(assessment.blockers.some(b=>/indispensável|Senioridade exigida|Experiência exigida|Registro profissional obrigatório|Habilitação exigida|Elegibilidade obrigatória/i.test(b)))return false;
  const unknown = (value: string) =>
    !value || /^(não|nao|unknown|unspecified)/i.test(value);
  return matchesObjectiveFilters(job, workspace.profile, {
    ...workspace.filters,
    contracts: unknown(job.contract) ? [] : workspace.filters.contracts,
    modalities: unknown(job.modality) ? [] : workspace.filters.modalities,
    locations: unknown(job.location) ? [] : workspace.filters.locations,
    dateKnownOnly: !job.publishedAt ? false : workspace.filters.dateKnownOnly,
    salaryOnly:
      job.salaryMin === null && job.salaryMax === null
        ? false
        : workspace.filters.salaryOnly,
  });
}
const vocabulary: Record<string, RegExp> = {
  "Atendimento ao público":
    /atend(?:imento|endo|er|ia|i)?\s+(?:ao |aos |a )?(?:publico|clientes?)|customer service/i,
  "Operação de caixa": /oper(?:acao|ador|adora) de caixa|\bcaixa\b|cashier/i,
  "Reposição de mercadorias":
    /\b(?:reposicao|repositor|repositora)\b|repor mercadorias/i,
  Vendas: /\bvendas?\b|vendedor|vendedora|sales/i,
  "Organização de estoque": /\bestoque\b|almoxarif|stock management/i,
  Logística: /logistica|logistics/i,
  "Separação de pedidos": /separa(?:cao|r) (?:de )?pedidos|order picking/i,
  Produção: /auxiliar de producao|linha de producao|operador de producao/i,
  Recepção: /recepcionista|recepcao|receptionist/i,
  "Rotinas administrativas":
    /rotinas? administrativas?|auxiliar administrativo|assistente administrativo/i,
  Excel: /\bexcel\b/i,
  Enfermagem: /enfermagem|enfermeir|nursing/i,
  "Cuidados com pacientes": /cuidados? (?:com |aos? )?pacientes|patient care/i,
  Educação: /professor|pedagogia|docencia|ensino de|teacher/i,
  Eletricidade: /eletricista|instalacoes eletricas|electrical/i,
  Mecânica: /mecanica|mecanico|mechanic/i,
  "Condução de veículos": /motorista|condutor|driver/i,
  Limpeza: /limpeza|higienizacao|cleaning/i,
  Cozinha: /cozinheiro|cozinheira|preparo de alimentos/i,
  "C#": /\bc#|\bcsharp\b|\bc sharp\b/i,
  ".NET": /\.net\b|\bdotnet\b|\basp\.?net\b/i,
  "ASP.NET Core": /asp\.?net\s*core/i,
  Angular: /\bangular\b/i,
  'Next.js': /\bnext(?:\.js|js)\b/i,
  'NestJS': /\bnest(?:\.js|js)\b/i,
  'Vue.js': /\bvue(?:\.js|js)?\b/i,
  'VB.NET': /\bvb\.?net\b/i,
  'DynamoDB': /\bdynamo\s?db\b/i,
  'Kubernetes': /\bkubernetes\b|\bgke\b/i,
  'GCP': /\bgcp\b|google cloud/i,
  'Clipper': /\bclipper\b/i,
  'PL/SQL': /\bpl\s*\/\s*sql\b/i,
  'Delphi': /\bdelphi\b/i,
  'Dapper': /\bdapper\b/i,
  'Redis': /\bredis\b/i,
  React: /\breact(?:js|\.js)?\b/i,
  "SQL Server": /\bsql server\b|\bmssql\b/i,
  PostgreSQL: /\bpostgres(?:ql)?\b/i,
  "Entity Framework": /\bentity framework\b|\bef core\b/i,
  "APIs REST": /\brest(?:ful)?\b|\bapis?\b/i,
  TypeScript: /\btypescript\b/i,
  JavaScript: /\bjavascript\b/i,
  "Node.js": /\bnode\.?js\b/i,
  Python: /\bpython\b/i,
  Java: /\bjava\b/i,
  Swift: /\bswift\b/i,
  Kotlin: /\bkotlin\b/i,
  iOS: /\bios\b|objective[ -]?c\b/i,
  Android: /\bandroid\b/i,
  Databricks: /\bdatabricks\b/i,
  Spark: /\b(?:apache )?spark\b|\bpyspark\b/i,
  Docker: /\bdocker\b/i,
  Git: /\bgit\b/i,
  Azure: /\bazure\b/i,
  AWS: /\baws\b|amazon web services/i,
  HTML: /\bhtml5?\b/i,
  CSS: /\bcss3?\b/i,
  PHP: /\bphp\b/i,
  Laravel: /\blaravel\b/i,
  MySQL: /\bmysql\b|\bmariadb\b/i,
  MongoDB: /\bmongo(?:db)?\b/i,
  Oracle: /\boracle\b/i,
  SQL: /(?<![\/-])\bsql\b(?! server)/i,
  Spring: /\bspring(?: boot)?\b/i,
  Kafka: /\bkafka\b/i,
  RabbitMQ: /\brabbit\s?mq\b/i,
  GraphQL: /\bgraphql\b/i,
  Express: /\bexpress(?:\.js|js)\b/i,
  Django: /\bdjango\b/i,
  Flask: /\bflask\b/i,
  FastAPI: /\bfast\s?api\b/i,
  Ruby: /\bruby\b/i,
  Rails: /\brails\b/i,
  Go: /\bgolang\b|\bgo lang\b/i,
  Rust: /\brust\b/i,
  Scala: /\bscala\b/i,
  Flutter: /\bflutter\b/i,
  Dart: /\bdart\b/i,
  "React Native": /\breact native\b/i,
  "Power BI": /\bpower ?bi\b/i,
  DAX: /\bdax\b/i,
  Tableau: /\btableau\b/i,
  Airflow: /\bairflow\b/i,
  Pandas: /\bpandas\b/i,
  "Machine Learning": /machine learning|aprendizado de maquina/i,
  Terraform: /\bterraform\b/i,
  Ansible: /\bansible\b/i,
  "CI/CD": /\bci\s?\/\s?cd\b|github actions|gitlab ci|jenkins|azure devops/i,
  Linux: /\blinux\b/i,
  "Windows Server": /\bwindows server\b/i,
  "Active Directory": /active directory/i,
  Redes: /\bredes\b|networking|\btcp\/ip\b/i,
  VMware: /\bvmware\b/i,
  Firewall: /\bfirewall\b/i,
  Cypress: /\bcypress\b/i,
  Selenium: /\bselenium\b/i,
  Postman: /\bpostman\b/i,
  Jest: /\bjest\b/i,
  "Testes automatizados": /testes? automatizad|automacao de testes|test automation/i,
  Figma: /\bfigma\b/i,
  Salesforce: /\bsalesforce\b/i,
  SAP: /\bsap\b/i,
  ABAP: /\babap\b/i,
  Protheus: /\bprotheus\b|\btotvs\b/i,
  Tailwind: /\btailwind\b/i,
  Bootstrap: /\bbootstrap\b/i,
  jQuery: /\bjquery\b/i,
  Elasticsearch: /\belastic\s?search\b/i,
};
const nonTechSkills = new Set(["Enfermagem", "Cuidados com pacientes", "Educação", "Eletricidade", "Mecânica", "Condução de veículos", "Limpeza", "Cozinha"]);
/** Technical skills the job asks for, excluding generic basics that every developer lists. */
const genericTech = new Set(["Git", "APIs REST", "HTML", "CSS", "Excel", "SQL", "Linux", "CI/CD", "Docker", "Bootstrap", "jQuery", "Figma", "Postman", "Testes automatizados", "Redes"]);
/** Only specific technologies can block an IT application; trade vocabulary and basics never do. */
export function isBlockingTechSkill(skill: string): boolean {
  const keys = Object.keys(vocabulary);
  return keys.includes(skill) ? keys.indexOf(skill) >= keys.indexOf("C#") && !genericTech.has(skill) && !nonTechSkills.has(skill) : true;
}
export function coreTechSkills(text: string): string[] {
  return extractSkills(text).filter((s) => !genericTech.has(s) && !nonTechSkills.has(s) && Object.keys(vocabulary).indexOf(s) > Object.keys(vocabulary).indexOf("Excel"));
}
function includesTerm(text: string, term: string): boolean {
  const normalized = normalize(term);
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(
    normalize(text),
  );
}
export function extractSkills(text: string, custom: string[] = []): string[] {
  const positive = evidenceLines(text).filter((line) => !line.negated);
  const technicalText = positive.map((line) => line.text).join("\n");
  const professional = positive
    .filter((line) => !line.domainOnly)
    .map((line) => line.text)
    .join("\n");
  const technical = new Set(Object.keys(vocabulary).slice(Object.keys(vocabulary).indexOf("Excel") + 1).filter((k) => !nonTechSkills.has(k)));
  return [
    ...new Set([
      ...Object.entries(vocabulary)
        .filter(([skill, re]) =>
          re.test(
            normalize(technical.has(skill) ? technicalText : professional),
          ),
        )
        .map(([s]) => s),
      ...custom.filter((s) => s && includesTerm(technicalText, s)),
    ]),
  ];
}
export function parseResume(text: string): Partial<Profile> {
  const sections = resumeSections(text);
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const education = lines.filter((s) =>
    /ensino (fundamental|medio|superior)|formacao:|escolaridade:|graduacao em|tecnico em|bacharel|licenciatura/.test(
      normalize(s),
    ),
  );
  let experience = lines.filter((s) =>
    /^(experiencia|trabalho informal|experiencia informal)\s*:/i.test(
      normalize(s),
    ),
  );
  const section = lines.findIndex((s) =>
    /^(?:experiencia profissional|historico profissional|experiencia)$/.test(
      normalize(s),
    ),
  );
  if (section >= 0) {
    const end = lines.findIndex(
      (s, i) =>
        i > section &&
        /^(?:formacao(?: academica)?|educacao|cursos|idiomas|competencias(?: tecnicas)?|habilidades|projetos(?: pessoais)?)$/.test(
          normalize(s),
        ),
    );
    experience = lines.slice(section + 1, end < 0 ? undefined : end);
  }
  const headline =
    lines
      .find((s) => /^(?:objetivo(?: profissional)?|cargo)\s*:/i.test(s))
      ?.replace(/^[^:]+:\s*/, "") ||
    lines
      .find((s) =>
        /^(?:analista de sistemas|desenvolvedor(?:a)?|programador(?:a)?|engenheir[oa] de software|software (?:engineer|developer)|medic[oa]|enfermeir[oa]|professor[oa]?|eletricista|motorista|recepcionista|vendedor[ae]?|operador[ae]? de caixa)\b/.test(
          normalize(s),
        ),
      )
      ?.split(/\s*[|]\s*|\s+com\s+/i)[0];
  return {
    skills: extractSkills(text),
    email: text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? "",
    github: text.match(/https?:\/\/(?:www\.)?github\.com\/[\w-]+/i)?.[0] ?? "",
    ...(sections.education || sections.courses || education.length
      ? {
          education: [
            sections.education || education.join("\n"),
            sections.courses,
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 5000),
        }
      : {}),
    ...(sections.experience || sections.projects || experience.length
      ? {
          experience: [
            sections.experience || experience.join("\n"),
            sections.projects,
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 10000),
        }
      : {}),
    ...(sections.objective || headline
      ? {
          headline: (sections.objective || headline!)
            .split("\n")[0]
            .slice(0, 200),
        }
      : {}),
    ...(sections.languages
      ? { languages: sections.languages.slice(0, 200) }
      : {}),
    confirmed: false,
  };
}
const roleFamilies = [
  /jovem aprendiz|aprendiz|primeiro emprego|sem experiencia|intern|estagi/,
  /software|desenvolv|developer|back.?end|full.?stack|front.?end|analista de sistemas|programador/,
  /designer|design|\bux\b|\bui\b|criativo|creative/,
  /financ|contabil|contador|accountan|controller|auditor/,
  /venda|sales|comercial|account executive|business development/,
  /atendent|caixa|repositor|auxiliar de loja|supermercado|atendimento|retail|customer (?:support|service)/,
  /recepcion|administrativ|secretari|office assistant/,
  /marketing|growth|social media|publicidade|comunicacao/,
  /\brh\b|recursos humanos|human resources|recruiter|recrut|talent/,
  /\bdata\b|dados|\bbi\b|business intelligence|power bi/,
  /devops|\bsre\b|cloud|plataforma|infraestrutura|infra\b/,
  /\bqa\b|quality|qualidade de software|\btest|\btester\b/,
  /suporte|help ?desk|service desk|infraestrutura|redes/,
  /operac|operations|logistic|supply chain|estoqu|almoxarif|producao/,
  /saude|health|enferme|nurs|medic|physician|terapeut|fisioterap/,
  /professor|teacher|educa|instrutor|instructor/,
  /advog|jurid|lawyer|legal/,
  /motorista|condutor|transporte|driver/,
  /eletric|mecanic|manutencao/,
  /cozinheir|cozinha|restaurante|alimentacao/,
  /limpeza|servicos gerais|higieniz/,
];
/** Search suggestions only: these titles never create qualifications in the profile. */
export function suggestRoles(
  profile: Partial<Profile>,
  titles: string[] = [],
): string[] {
  const text = normalize(
    evidenceLines(
      [
        profile.headline,
        profile.experience,
        ...(profile.skills || []),
        ...titles,
      ]
        .filter(Boolean)
        .join("\n"),
    )
      .filter((line) => !line.domainOnly && !line.negated)
      .map((line) => line.text)
      .join("\n"),
  );
  const suggestions: string[] = [...titles];
  if (
    /supermercado|auxiliar de loja|atendimento|atendent|\bcaixa\b|\brepositor[ae]?\b/.test(
      text,
    )
  )
    suggestions.push(
      "Atendente",
      "Operador de caixa",
      "Repositor",
      "Auxiliar de loja",
    );
  if (/administrativ|recepcion|secretari/.test(text))
    suggestions.push("Auxiliar administrativo", "Recepcionista");
  if (/logistic|estoque|almoxarif/.test(text))
    suggestions.push("Auxiliar de logística", "Auxiliar de estoque");
  if (/primeiro emprego|jovem aprendiz|sem experiencia/.test(text))
    suggestions.push("Jovem aprendiz", "Auxiliar sem experiência");
  return [...new Set(suggestions)].slice(0, 20);
}
export function dedupKey(
  job: Pick<Job, "title" | "company" | "location">,
): string {
  return createHash("sha256")
    .update([job.title, job.company, job.location].map(normalize).join("|"))
    .digest("hex");
}
function experienceRequirements(text: string) {
  const companyYears: number[] = [];
  let requiredYears: number | null = null;
  for (const raw of text.split(/\r?\n|(?<=[.!?;])\s+/)) {
    const sentence = normalize(raw);
    const match = sentence.match(
      /(?:at least|minimo(?: de)?|minimum(?: of)?)?\s*(\d{1,2})\+?\s*(?:anos|years)\s+(?:de experiencia|of (?:relevant )?experience)|(?:at least|minimum of|minimo de)\s*(\d{1,2})\+?\s*(?:anos|years)|experiencia\s+(?:minima\s+)?(?:de\s+)?(\d{1,2})\+?\s*anos/,
    );
    if (!match) continue;
    const years = Number(match[1] || match[2] || match[3]);
    const companyHistory =
      /\b(?:aceleramos|somos|atuamos|contamos|fundada|fundado|nossa empresa|nossa companhia|our company|we have|we are|we accelerate|no mercado|de mercado|historia da empresa)\b/.test(
        sentence,
      );
    const candidateRequirement =
      /\b(?:exigimos|exige|necessari[oa]|requisito|candidat[oa]|voce|you|must|required|at least|minimum|minimo|minima|pelo menos|profissional com)\b/.test(
        sentence,
      );
    if (companyHistory && !candidateRequirement) companyYears.push(years);
    else requiredYears ??= years;
  }
  return { requiredYears, companyYears };
}
const namedTechnologies = new Set([
  "C#", ".NET", "ASP.NET Core", "Angular", "React", "SQL Server", "PostgreSQL",
  "Entity Framework", "APIs REST", "TypeScript", "JavaScript", "Node.js", "Python",
  "Java", "Swift", "Kotlin", "iOS", "Android", "Databricks", "Spark", "Docker", "Git",
  "Azure", "AWS", "HTML", "CSS", "Excel",
]);

/** Repairs only demonstrable old parsing mistakes; preserves other publisher-supplied facts. */
export function correctJobEvidence(job: Job): Job {
  const evidence = experienceRequirements(job.description);
  const corrected = {
    ...job,
    // Re-read old inferred conjunctions from the publisher. Explicit fields in
    // a manually entered vacancy remain the person's own requirement choices.
    requiredSkills: job.origins.some(origin=>origin.source==='manual') || /^(manual|importação manual)$/i.test(job.source)
      ? job.requiredSkills : mandatoryTechnicalSkills(job.description),
    // A fuller publisher description must update the evidence used by matching.
    // Old snippets often kept only Git/APIs, hiding the actual mobile/data stack.
    skills: [...new Set([...job.skills, ...extractSkills(job.description),
      ...extractSkills(job.title).filter(skill=>namedTechnologies.has(skill))])],
  };
  if (
    job.requiredYears !== null &&
    evidence.companyYears.includes(job.requiredYears)
  )
    corrected.requiredYears = evidence.requiredYears;
  if (
    job.level === "Aprendiz" &&
    !/\b(?:aprendiz|apprentice)\b/.test(
      normalize(job.title + " " + job.description),
    )
  )
    corrected.level = classify(job.title).level;
  return corrected;
}

export function classify(text: string) {
  const n = normalize(text);
  return {
    contract: /jovem aprendiz|contrato de aprendizagem/.test(n)
      ? "Aprendiz"
      : /estagio|internship/.test(n)
        ? "Estágio"
        : /\bclt\b/.test(n)
          ? "CLT"
          : /temporari|temporary/.test(n)
            ? "Temporário"
            : /\bpj\b|pessoa juridica|contractor/.test(n)
              ? "PJ"
              : "Não especificado",
    level: /\b(?:jovem aprendiz|aprendiz|apprentice)\b/.test(n)
      ? "Aprendiz"
      : /sem experiencia|primeiro emprego|no experience/.test(n)
        ? "Primeiro emprego"
        : /senior|\bsr\b|staff|\bprincipal\s+(?:software\s+)?(?:engineer|developer|architect|designer)\b|\b(?:engineer|developer|architect|designer)\s+principal\b|lead/.test(n)
          ? "Sênior"
          : /pleno|\bmid/.test(n)
            ? "Pleno"
            : /junior|\bjr\b|engineer i\b|entry.level|associate/.test(n)
              ? "Júnior"
              : /estagio|intern/.test(n)
                ? "Estágio"
                : /trainee/.test(n)
                  ? "Trainee"
                  : "Não especificado",
    modality: /hybrid|hibrid/.test(n)
      ? "Híbrido"
      : /remote|remoto|home office/.test(n)
        ? "Remoto"
        : /on.site|presencial/.test(n)
          ? "Presencial"
          : "Não especificado",
    requiredYears: experienceRequirements(text).requiredYears,
  };
}
const stateNames: Record<string, string> = {
  sp: "sao paulo",
  mg: "minas gerais",
  rj: "rio de janeiro",
  pr: "parana",
  sc: "santa catarina",
  rs: "rio grande do sul",
  ba: "bahia",
  pe: "pernambuco",
  ce: "ceara",
  df: "distrito federal",
  go: "goias",
  es: "espirito santo",
  am: "amazonas",
  pa: "para",
  ma: "maranhao",
  rn: "rio grande do norte",
  pb: "paraiba",
  al: "alagoas",
  se: "sergipe",
  pi: "piaui",
  mt: "mato grosso",
  ms: "mato grosso do sul",
  ro: "rondonia",
  rr: "roraima",
  ap: "amapa",
  to: "tocantins",
  ac: "acre",
};
export function locationMatches(
  jobLocation: string,
  desired: string[],
): boolean {
  if (!desired.length) return true;
  const location = normalize(jobLocation);
  return desired.filter(Boolean).some((item) => {
    const target = normalize(item);
    if (["br", "brasil", "brazil"].includes(target)) {
      if (
        /\b(?:us|usa|united states|estados unidos|uk|united kingdom|canada|paraguay|paraguai|argentina|portugal)\b/.test(
          location,
        )
      )
        return false;
      return (
        /\bbrasil\b|\bbrazil\b|\bbr\b/.test(location) ||
        Object.entries(stateNames).some(
          ([state, name]) =>
            new RegExp(`(?:^|[,/ -])${state}(?:$|[,/ -])`).test(location) ||
            new RegExp(`\\b${name}\\b`).test(location),
        )
      );
    }
    if (stateNames[target])
      return (
        location.includes(stateNames[target]) ||
        new RegExp(`(?:^|[,/ -])${target}(?:$|[,/ -])`).test(location)
      );
    const targetParts = target.split(/[,/]/).map((part) => part.trim());
    const city = targetParts[0];
    const locationParts = location.split(/[,/]/).map((part) => part.trim());
    const state = (part: string) =>
      stateNames[part] ||
      Object.values(stateNames).find((name) => name === part);
    const desiredState = targetParts.slice(1).map(state).find(Boolean);
    const actualState = locationParts.slice(1).map(state).find(Boolean);
    // A missing state is unknown; an explicit different state must not be ignored.
    if (desiredState && actualState && desiredState !== actualState)
      return false;
    return !!city && locationParts.some((part) => part === city);
  });
}
/** Role matching shared by discovery and final filtering, for every profession. */
export function matchesRoleTitle(title: string, titles: string[], headline = ""): boolean {
  if (!titles.length) return true;
  const actual = normalize(title);
  const desired = normalize((titles.length ? titles : [headline]).join(" "));
  return expandSearchTitles(titles).some((target) =>
    normalize(target).split(" ").filter((token) => !["de", "do", "da", "e"].includes(token))
      .every((token) => actual.includes(token)),
  ) || roleFamilies.some((family) => family.test(actual) && family.test(desired));
}
const titleStacks: [string, string[]][] = [
  ["Java", ["Java", "Spring", "Kotlin"]],
  ["Spring", ["Java", "Spring"]],
  ["Kotlin", ["Kotlin", "Java", "Android"]],
  [".NET", [".NET", "C#", "ASP.NET Core"]],
  ["C#", ["C#", ".NET"]],
  ["Python", ["Python", "Django", "Flask", "FastAPI"]],
  ["PHP", ["PHP", "Laravel"]],
  ["Laravel", ["PHP", "Laravel"]],
  ["Ruby", ["Ruby", "Rails"]],
  ["Golang", ["Golang", "Go"]],
  ["Node.js", ["Node.js", "NodeJS", "JavaScript", "TypeScript"]],
  ["React", ["React", "React Native"]],
  ["React Native", ["React Native", "React"]],
  ["Angular", ["Angular"]],
  ["Vue", ["Vue", "Vue.js"]],
  ["Flutter", ["Flutter", "Dart"]],
  ["Swift", ["Swift", "iOS"]],
  ["iOS", ["iOS", "Swift"]],
  ["Android", ["Android", "Kotlin"]],
  ["Delphi", ["Delphi"]],
  ["COBOL", ["COBOL"]],
  ["ABAP", ["ABAP", "SAP"]],
  ["Salesforce", ["Salesforce"]],
  ["Elixir", ["Elixir"]],
  ["Scala", ["Scala"]],
  ["Rust", ["Rust"]],
  ["Oracle", ["Oracle", "PL/SQL"]],
];
// Titles that are IT on their own.
const strongTechTitle =
  /\b(?:desenvolvedor\w*|developer|programador\w*(?! de manutencao)|software|engenheir\w* (?:de )?(?:software|dados|data|computacao|machine learning|ml|devops|cloud|qa|testes|plataforma|confiabilidade)|engineer|analista (?:de )?(?:sistemas|desenvolvimento|dados|bi|qa|testes|seguranca da informacao|redes|ti|devops|cloud|banco de dados|suporte (?:tecnico|de ti)|infraestrutura de ti)|arquitet\w* (?:de )?(?:software|solucoes|sistemas|cloud|dados)|back.?end|front.?end|full.?stack|mobile|android|ios|devops|sre|qa|quality assurance|tester|cientista de dados|data scien\w*|dba|help ?desk|service desk|suporte (?:tecnico|de ti|n[1-3])|tecnico de (?:informatica|ti|suporte)|seguranca da informacao|ciberseguranca|cybersecurity|\bti\b|tecnologia da informacao|scrum master|tech lead|power bi|business intelligence|machine learning|java|python|php|react|angular|node|golang|kotlin|flutter|salesforce|abap)\b/;
// Titles that are IT only when the posting itself asks for technology.
const weakTechTitle = /\b(?:desenvolv\w*|estagi\w*|infraestrutura|infra|suporte|sistemas|dados|data|tecnologia|banco de dados|bi|cloud|redes|seguranca|programa\w*|analista|tecnico|it)\b/;
/** The product only serves technology careers; non-IT postings are never recommended. */
export function isTechJob(title: string, description = ""): boolean {
  const t = normalize(title);
  if (strongTechTitle.test(t) || /(?:^|[^a-z0-9])(?:\.net|c#)(?=$|[^a-z0-9])/.test(t)) return true;
  if (!weakTechTitle.test(t)) return false;
  const keys = Object.keys(vocabulary);
  return extractSkills(description).some((s) => keys.indexOf(s) >= keys.indexOf("C#")) ||
    /linguagem de programacao|desenvolvimento de software|logica de programacao/.test(normalize(description));
}
/** True when every technology named in the title is backed by the candidate's own skills or experience. */
export function titleStackCompatible(title: string, profile: Pick<Profile, "skills" | "experience" | "headline">): boolean {
  const own = [...(profile.skills || []), profile.experience || "", profile.headline || ""].join(" \n ");
  // Without any technical evidence yet (resume not read), keep the job instead of guessing.
  if (!extractSkills(own).length) return true;
  return titleStacks
    .filter(([term]) => includesTerm(title, term))
    .every(([, accepted]) => accepted.some((skill) => includesTerm(own, skill)));
}
/** Languages, frameworks and platforms that define what a role actually builds with. */
const primaryStack = new Set(["C#", ".NET", "ASP.NET Core", "VB.NET", "Java", "Spring", "Kotlin", "Python", "Django", "Flask", "FastAPI", "PHP", "Laravel", "Ruby", "Rails", "Go", "Rust", "Scala", "Node.js", "NestJS", "Express", "React", "React Native", "Next.js", "Angular", "Vue.js", "Flutter", "Dart", "Swift", "iOS", "Android", "Delphi", "Clipper", "Power BI", "Tableau", "Spark", "Databricks", "Airflow", "Salesforce", "SAP", "ABAP", "Protheus", "Cypress", "Selenium", "Terraform", "Kubernetes", "Windows Server", "Active Directory", "VMware"]);
const equivalent: Record<string, string[]> = { ".NET": ["C#", "ASP.NET Core"], "C#": [".NET"], "ASP.NET Core": ["C#", ".NET"], "Spring": ["Java"], "Next.js": ["React"], "React Native": ["React"], "Dart": ["Flutter"], "Flutter": ["Dart"] };
/** A job is incompatible when it names a primary stack and the candidate has none of it. */
export function stackCoverageCompatible(job: Pick<Job, "title" | "description">, profile: Pick<Profile, "skills" | "experience" | "headline">): boolean {
  const own = new Set(coreTechSkills([...(profile.skills || []), profile.experience || "", profile.headline || ""].join("\n")));
  if (!own.size) return true; // resume not read yet: do not guess
  const wanted = coreTechSkills(job.title + "\n" + job.description).filter((s) => primaryStack.has(s));
  if (!wanted.length) return true;
  return wanted.some((s) => own.has(s) || (equivalent[s] || []).some((e) => own.has(e)));
}
/** With an AI reading, the candidate needs at least one of the posting's central technologies. */
export function aiStackCompatible(stack: string[], profile: Pick<Profile, "skills" | "experience" | "headline">): boolean {
  const ownText = [...(profile.skills || []), profile.experience || "", profile.headline || ""].join("\n");
  const own = new Set(extractSkills(ownText).map(normalize));
  if (!own.size) return true;
  return stack.some((s) => {
    const canonical = extractSkills(s).map(normalize);
    const names = canonical.length ? canonical : [normalize(s)];
    return names.some((n) => own.has(n) || (equivalent[extractSkills(s)[0]] || []).some((e) => own.has(normalize(e))) || includesTerm(ownText, s));
  });
}
/** Postings reserved for people with disabilities; never applied to without the person's explicit confirmation. */
export function isPcdExclusive(title: string, description = ""): boolean {
  const t = normalize(title), text = normalize(title + " " + description);
  return /(?:afirmativa|exclusiv[ao]|vagas? para)\s*(?:[(:—-]\s*)?(?:para\s+)?(?:pessoas?\s+)?(?:com\s+deficiencia|pcd)/.test(t) ||
    /(?:^|[^a-z0-9])(?:pcd|pcds|p\.c\.d\.?)(?=$|[^a-z0-9])/.test(t) ||
    /(?:vaga afirmativa|exclusiv[ao]|destinad[ao]s?|reservad[ao]s?|somente|apenas)\s*(?:para\s+|a\s+)?(?:pessoas?\s+)?(?:com\s+deficiencia|pcd)/.test(text);
}
export function matchesObjectiveFilters(
  job: Job,
  profile: Profile,
  filters: Filters,
): boolean {
  if (job.availability === "closed") return false;
  if (job.aiReading?.category === "not-it") return false;
  if (!isTechJob(job.title, job.description)) return false;
  if (
    profile.acceptsPj === false &&
    /\bpj\b|pessoa juridica/.test(normalize(job.contract))
  )
    return false;
  const content = [job.title, job.description, ...job.skills].join(" ");
  const cited = extractSkills(content, filters.skills);
  if (
    filters.skills.length &&
    !filters.skills.some((skill) =>
      cited.some((s) => normalize(s) === normalize(skill)),
    )
  )
    return false;
  if (filters.language) {
    const synonyms: Record<string, string[]> = {
      ingles: ["inglês", "English"],
      english: ["inglês", "English"],
      portugues: ["português", "Portuguese"],
      portuguese: ["português", "Portuguese"],
      espanhol: ["espanhol", "Spanish"],
      spanish: ["espanhol", "Spanish"],
      frances: ["francês", "French"],
      french: ["francês", "French"],
    };
    const desiredLanguage = synonyms[normalize(filters.language)] || [
      filters.language,
    ];
    if (!desiredLanguage.some((language) => includesTerm(content, language)))
      return false;
  }
  const firstJobWanted = filters.titles.some((title) =>
    /primeiro emprego|sem experiencia/.test(normalize(title)),
  );
  const beginnerRole =
    firstJobWanted &&
    (job.level === "Primeiro emprego" ||
      job.requiredYears === 0 ||
      /sem experiencia|nao exige experiencia|no experience/.test(
        normalize(job.description),
      ));
  if (
    filters.titles.length &&
    !beginnerRole &&
    !matchesRoleTitle(job.title, filters.titles, profile.headline)
  )
    return false;
  // Related role families cannot silently erase an explicitly requested specialization.
  const specialties = [
    "C#",
    ".NET",
    "Angular",
    "React",
    "Java",
    "Python",
    "SQL Server",
    "PostgreSQL",
    "Excel",
    "SAP",
    "COREN",
    "CRM",
    "CNH B",
    "CNH C",
    "CNH D",
    "CNH E",
  ];
  if (
    filters.titles.length &&
    !filters.titles.some((t) =>
      specialties
        .filter((s) => includesTerm(t, s))
        .every((s) => includesTerm(content, s)),
    )
  )
    return false;
  // A stack named in the job title (e.g. "Analista de Sistemas Java") is the core of the
  // role: a generic title match must not recommend it to someone without that stack.
  // The AI reading only adds evidence: it can veto a job, never loosen the rules.
  if (!titleStackCompatible(job.title, profile)) return false;
  if (!stackCoverageCompatible(job, profile)) return false;
  if (job.aiReading?.primaryStack.length && !aiStackCompatible(job.aiReading.primaryStack, profile)) return false;
  const assessment = analyze(job, profile, filters);
  return !assessment.blockers.some((s) =>
    /fora das suas preferencias|fora das suas preferências|fora do periodo|fora do período|abaixo do minimo|abaixo do mínimo|acima do maximo|acima do máximo|empresa bloqueada|termo excluido|termo excluído|seu filtro|seu limite|vaga nao cita|vaga não cita/.test(
      s.toLowerCase(),
    ),
  );
}
export function matchSignature(
  profile: Profile,
  job: Job,
  filters: Filters,
): string {
  job = correctJobEvidence(job);
  return createHash("sha256")
    .update(
      JSON.stringify({
        policy: 'preferences-and-explicit-requirements-v3',
        profile,
        filters,
        job: {
          title: job.title,
          description: job.description,
          company: job.company,
          location: job.location,
          modality: job.modality,
          level: job.level,
          contract: job.contract,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          currency: job.currency,
          salaryPeriod: job.salaryPeriod,
          skills: job.skills,
          requiredSkills: job.requiredSkills,
          requiredYears: job.requiredYears,
          publishedAt: job.publishedAt,
        },
      }),
    )
    .digest("hex");
}
export function matchesJobLocation(job: Job, filters: Filters): boolean {
  if (!filters.locations.length) return true;
  if (job.modality === "Remoto" && filters.remoteAnywhere !== false) {
    const location = normalize(job.location);
    if (
      /nao informad|nao especificad|^remot[oe]$|worldwide|global|anywhere/.test(
        location,
      )
    )
      return true;
    return locationMatches(job.location, ["Brasil"]);
  }
  return locationMatches(job.location, filters.locations);
}
export function analyze(job: Job, profile: Profile, filters: Filters): Match {
  job = correctJobEvidence(job);
  const known = new Set(
    [
      ...profile.skills,
      ...extractSkills(profile.experience + " " + profile.education),
    ].map(normalize),
  );
  const matchedSkills = job.skills.filter((s) => known.has(normalize(s)));
  const missingSkills = job.skills.filter((s) => !known.has(normalize(s)));
  const strengths: string[] = [],
    gaps: string[] = [],
    blockers: string[] = [];
  const text = normalize(job.title + " " + job.description);
  const jobTitle = normalize(job.title);
  const affirmativePcd=isPcdExclusive(job.title, job.description);
  if(affirmativePcd){
    const urls=[job.url,...(job.destinations||[]).map(d=>d.url)];
    const approved=profile.approvedAnswers?.some(a=>a.confirmedAt&&a.destinationUrl&&urls.includes(a.destinationUrl)&&
      /^(?:voce e (?:uma )?pessoa com deficiencia\??|voce e pcd\??|elegibilidade para vaga afirmativa pcd)$/.test(normalize(a.question))&&/^(sim|yes|true)$/i.test(a.value));
    if(!approved)blockers.push('Elegibilidade obrigatória da vaga afirmativa PcD exige confirmação específica; não foi presumida.');
  }
  const directTitle = [...filters.titles, profile.headline]
    .filter(Boolean)
    .some((t) => {
      const tokens = normalize(t)
        .split(" ")
        .filter((s) => !["de", "do", "da", "com", "e"].includes(s));
      return (
        tokens.length > 0 && tokens.every((token) => jobTitle.includes(token))
      );
    });
  const target = normalize(filters.titles.join(" ") + " " + profile.headline);
  const roleFamily = roleFamilies.some(
    (family) => family.test(jobTitle) && family.test(target),
  );
  const radar = !directTitle && roleFamily && matchedSkills.length >= 2;
  const evidenceText = normalize(
    [profile.education, profile.experience, ...profile.skills].join("\n"),
  );
  const qualificationText = evidenceText
    .split(/[\n.;]/)
    .filter(
      (s) =>
        !/nao (?:possuo|tenho|conclui)|sem (?:registro|cnh|formacao)|incomplet|cursando|vencid|inativ/.test(
          s,
        ),
    )
    .join(" ");
  const licenses = [
    "COREN",
    "CRM",
    "CREFITO",
    "CRP",
    "CRF",
    "CREA",
    "OAB",
    "CRN",
    "CREF",
  ];
  for (const license of licenses) {
    const re = new RegExp(`\\b${license.toLowerCase()}\\b`);
    const mandatory = text
      .split(/[\n.;]/)
      .some(
        (sentence) =>
          re.test(sentence) &&
          /obrigatori|exig|necessari|registro|ativ[oa]/.test(sentence) &&
          !/desejav|diferencial|opcional|nao obrig|nao exig/.test(sentence),
      );
    if (mandatory && !re.test(qualificationText))
      blockers.push(
        `Registro profissional obrigatório não confirmado: ${license}.`,
      );
  }
  const driving = mandatoryRequirementLines(job.description).map(normalize).join('\n').match(/cnh\s*(?:categoria\s*)?([abcde])\b/);
  if (
    driving &&
    !new RegExp(`cnh\\s*(?:categoria\\s*)?${driving[1]}\\b`).test(
      qualificationText,
    )
  )
    blockers.push(
      `Habilitação exigida não confirmada: CNH ${driving[1].toUpperCase()}.`,
    );
  const schooling = (s: string) =>
    /ensino superior|graduacao|bacharel|licenciatura/.test(s)
      ? 3
      : /ensino medio/.test(s)
        ? 2
        : /ensino fundamental/.test(s)
          ? 1
          : 0;
  const requiredSchooling = schooling(text),
    confirmedSchooling = schooling(qualificationText);
  const mandatorySchooling=Math.max(0,...mandatoryRequirementLines(job.description).map(line=>schooling(normalize(line))));
  if(mandatorySchooling>confirmedSchooling)blockers.push('Escolaridade obrigatória não confirmada no perfil.');
  if (requiredSchooling && confirmedSchooling < requiredSchooling)
    gaps.push(
      "Escolaridade citada na vaga ainda não confirmada no seu perfil.",
    );
  if (requiredSchooling && confirmedSchooling >= requiredSchooling)
    strengths.push("Escolaridade informada atende ao nível citado na vaga.");
  if (
    /disponibilidade|escala|horario|turno|plantao/.test(text) &&
    !profile.availability
  )
    gaps.push(
      "Confirme sua disponibilidade de horário e compare com a escala da vaga.",
    );
  if (matchedSkills.length)
    strengths.push(`Competências em comum: ${matchedSkills.join(", ")}.`);
  if (missingSkills.length)
    gaps.push(
      `Competências citadas que não estão no perfil: ${missingSkills.join(", ")}. Uma menção isolada não impede a candidatura.`,
    );
  if (!profile.confirmed)
    blockers.push("Confirme seu perfil antes de preparar uma candidatura.");
  if (/s[eê]nior|tech lead|lideran[cç]a/i.test(job.level) && /^(?:n[aã]o|unknown|unspecified)/i.test(profile.level))
    blockers.push('Senioridade exigida ainda não confirmada no perfil.');
  if (/pleno|s[eê]nior|especialista/i.test(job.level) && /est[aá]gi|aprendiz|primeiro emprego|trainee/i.test(profile.level || ''))
    blockers.push('Senioridade exigida acima do seu nível atual.');
  if (/est[aá]gi/i.test(profile.level || '') && !/estagi|trainee|aprendiz|intern/.test(normalize(job.title + ' ' + job.level)))
    blockers.push('Seu perfil é de estágio; esta vaga não é de estágio.');
  if (!profile.skills.length)
    gaps.push("Confira suas competências e os requisitos publicados.");
  if (!job.skills.length)
    gaps.push("A fonte não identificou competências; revise a descrição.");
  // Long "mandatory" lists in real postings work as wish lists: with 3+ items, block only
  // when the candidate covers less than half of them. Short, explicit requirements still block.
  const publisherRequired = job.requiredSkills.filter(isBlockingTechSkill);
  const coveredRequired = publisherRequired.filter((s) => known.has(normalize(s))).length;
  const wishList = publisherRequired.length >= 3 && coveredRequired / publisherRequired.length >= 0.5;
  for (const required of [...(wishList ? [] : publisherRequired), ...filters.requiredSkills]) {
    if (!known.has(normalize(required)))
      blockers.push(`Competência indispensável não confirmada: ${required}.`);
  }
  for(const alternatives of mandatorySkillGroups(job.description).filter(group=>group.length>1)){
    if(!alternatives.some(skill=>known.has(normalize(skill))))blockers.push(`Competência indispensável não confirmada: ${alternatives.join(' ou ')}.`);
  }
  for (const required of filters.requiredSkills)
    if (!job.skills.some((s) => normalize(s) === normalize(required)))
      blockers.push(
        `A vaga não cita sua competência indispensável: ${required}.`,
      );
  if (job.requiredYears !== null && job.requiredYears > filters.maxYears)
    blockers.push(
      `Exige ${job.requiredYears} anos; seu limite é ${filters.maxYears}.`,
    );
  if (
    job.requiredYears !== null &&
    profile.years !== null &&
    job.requiredYears > profile.years
  )
    gaps.push(
      `Exige ${job.requiredYears} anos; você confirmou ${profile.years}.`,
    );
  if (
    job.level === "Júnior" &&
    job.requiredYears !== null &&
    job.requiredYears >= 5
  )
    blockers.push("O título é júnior, mas a experiência exigida é elevada.");
  if (
    job.salaryMax !== null &&
    job.currency === "BRL" &&
    (() => {
      const period = normalize(job.salaryPeriod || "");
      const monthly = /^(month|monthly|mensal|mes)$/.test(period)
        ? job.salaryMax
        : /^(year|yearly|annual|annually|anual|ano)$/.test(period)
          ? job.salaryMax / 12
          : !period && job.source === "Manual"
            ? job.salaryMax
            : null;
      return monthly !== null && monthly < filters.salaryMin;
    })()
  )
    blockers.push("Faixa salarial abaixo do mínimo configurado.");
  if (job.salaryMin === null) gaps.push("Salário não divulgado.");
  else if (!job.salaryPeriod && job.source !== "Manual")
    gaps.push(
      "Período salarial não informado; o valor não foi comparado ao mínimo mensal.",
    );
  if (filters.salaryOnly && job.salaryMin === null)
    blockers.push("Seu filtro exige salário divulgado.");
  if (filters.salaryMax && job.salaryMin !== null && job.currency === "BRL") {
    const period = normalize(job.salaryPeriod || "");
    const monthly =
      /^(month|monthly|mensal|mes)$/.test(period) ||
      (!period && job.source === "Manual")
        ? job.salaryMin
        : /^(year|yearly|annual|annually|anual|ano)$/.test(period)
          ? job.salaryMin / 12
          : null;
    if (monthly !== null && monthly > filters.salaryMax)
      blockers.push("Faixa salarial acima do máximo configurado.");
  }
  if (
    filters.blockedCompanies.some(
      (c) => normalize(c) === normalize(job.company),
    )
  )
    blockers.push("Empresa bloqueada nas suas preferências.");
  if (filters.levels.length && !filters.levels.includes(job.level))
    blockers.push("Senioridade fora das suas preferências.");
  if (
    filters.modalities.length &&
    filters.modalities.length < 3 &&
    !filters.modalities.includes(job.modality)
  )
    blockers.push("Modalidade fora das suas preferências.");
  const contractMissing = !normalize(job.contract) || /^(?:nao (?:especificad[oa]|informad[oa]|divulgad[oa]|definid[oa])|unknown|unspecified|not (?:specified|provided|informed)|a combinar)$/.test(normalize(job.contract));
  if (contractMissing)
    gaps.push("Regime de contratação não informado no anúncio.");
  if (!contractMissing && filters.contracts.length && !filters.contracts.includes(job.contract))
    blockers.push("Contratação fora das suas preferências.");
  if (filters.locations.length && !matchesJobLocation(job, filters))
    blockers.push(
      "Localização fora das suas preferências; revise restrições geográficas.",
    );
  if (filters.language && !text.includes(normalize(filters.language)))
    gaps.push(
      `Idioma desejado (${filters.language}) não confirmado pela descrição.`,
    );
  if (filters.excludedTerms.some((t) => text.includes(normalize(t))))
    blockers.push("A descrição contém um termo excluído.");
  if (/pagamento para candid|application fee|taxa de inscricao/.test(text))
    blockers.push("Possível cobrança pela candidatura.");
  if (
    job.publishedAt &&
    (filters.dateKnownOnly || filters.ageDays < 365) &&
    Date.now() - Date.parse(job.publishedAt) > filters.ageDays * 86400000
  )
    blockers.push("Publicação fora do período configurado.");
  if (
    filters.dateKnownOnly &&
    (!job.publishedAt || !Number.isFinite(Date.parse(job.publishedAt)))
  )
    blockers.push("Seu filtro exige uma data de publicação informada.");
  const enoughProfile = known.size > 0 || !!profile.education || profile.years !== null;
  const enoughJob = job.skills.length > 0 || !!requiredSchooling || job.requiredYears !== null;
  const confidence = enoughProfile && enoughJob ? "sufficient" : "insufficient";
  if (!enoughJob) gaps.push("Confira os requisitos no anúncio completo; a fonte não trouxe todos os detalhes.");
  if (directTitle) strengths.push("Cargo alinhado aos cargos escolhidos.");
  if (filters.modalities.includes(job.modality)) strengths.push("Modalidade dentro das suas preferências.");
  const criteria: {label:string;earned:number;possible:number}[] = [];
  // Deprecated wire field for old clients. No score is calculated or used.
  const score = 0;
  const result: Match = {
    score: Math.round(score),
    strengths,
    gaps,
    blockers,
    matchedSkills,
    missingSkills,
    radar,
    confidence,
    criteria,
    explanation: blockers.length
      ? "Confira os impedimentos específicos abaixo. A decisão usa preferências e exigências explícitas, sem pontuação."
      : `${!enoughJob ? 'Há ausência de informação no anúncio; confira os requisitos na página completa. ' : ''}As competências citadas são contexto para sua avaliação. Apenas exigências obrigatórias explícitas podem impedir a candidatura; não é necessário dominar toda a lista de tecnologias.`,
  };
  if (job.match?.advice?.signature === matchSignature(profile, job, filters)) {
    result.advice = job.match.advice;
    result.explanation += `\nLeitura complementar por IA, sujeita à sua revisão: ${job.match.advice.explanation}`;
  }
  return result;
}
export function nextExecution(time: string, from = new Date()): string {
  // Explicit São Paulo UTC-3. Scheduling is intentionally restricted to this timezone.
  const date = new Date(from.getTime() - 3 * 3600000)
    .toISOString()
    .slice(0, 10);
  const next = new Date(`${date}T${time}:00-03:00`);
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
