import { randomUUID } from "node:crypto";
import type { Job, Source, Workspace } from "../shared/types";
import { antigravityAvailable } from "./antigravity";
import { geminiConfigured } from "./gemini";
import { searchCitedUrls } from "./equivalent-search";
import { detectAts,configuredAtsSources } from "./ats-registry";
import { publicUrl, readPublicPage, type PublicPage } from "./public-web";
import { publicationFromStructured, structuredJobs } from "./destination-page";
import { extractSkills } from "./engine";
import { canonicalJobUrl } from "./job-identity";
import { discoveryBudgetExpired } from "./discovery-budget";
import { SourceError } from "./connectors";
import { employerPostUrl, jobFromEmployerPost } from "./employer-posts";
import { verifyEmailDestination } from "./email-destination";
import {configuredQuickinBoards,jobFromQuickinPage} from './quickin-board';
import {jobFromCompanyPage,wpJobsForm} from './company-board';

export const officialCareersSource: Source = {
  id: "official-careers",
  type: "manual",
  board: "official-careers",
  company: "Páginas de carreira das empresas",
  enabled: true,
  discovery: true,
  application: false,
  status: "Busca direta em páginas oficiais",
};
export const corporateEmailSource: Source = {
  ...officialCareersSource, id:"corporate-email-careers",board:"corporate-email-careers",
  company:"Vagas com candidatura por e-mail",status:"Pesquisa de canais de candidatura por e-mail",
};

export function officialDiscoveryAvailable(userId?: string) {
  return (
    process.env.OFFICIAL_CAREERS_DISCOVERY_ENABLED === "true" &&
    (geminiConfigured() || antigravityAvailable(userId))
  );
}

type Dependencies = {
  search?: typeof searchCitedUrls;
  readPage?: (url: string) => Promise<PublicPage>;
};

/** No candidate files, contact details or credentials enter the search prompt. */
export async function discoverOfficialCareers(
  workspace: Workspace,
  userId?: string,
  dependencies: Dependencies = {},
  emailOnly = false,
) {
  const roles = workspace.filters.titles.slice(0, 4);
  if (!roles.length)
    throw new SourceError("Confirme os cargos para buscar nas empresas.");
  const channel = emailOnly
    ? 'Busque exclusivamente anúncios individuais de emprego nas páginas oficiais de empresas ou publicações da própria empresa no LinkedIn que peçam EXPRESSAMENTE o envio de currículo por e-mail corporativo. Use consultas com "envie seu currículo", "candidatura por e-mail" e os cargos. Não inclua formulários, portais, e-mails apenas para dúvidas nem bancos genéricos de talentos.'
    : 'Descubra NOVOS quadros oficiais a partir de vagas individuais atuais em Quickin, Greenhouse, Lever, Ashby, SmartRecruiters ou formulários nativos WP Jobs Board. Priorize canais sem login e empresas diferentes. Um domínio reconhecido não comprova formulário funcional; a rotina fará a verificação.';
  const technologies=workspace.profile.confirmed?extractSkills(workspace.profile.skills.join('\n')):[];
  const known=[...configuredAtsSources(),...configuredQuickinBoards(),...(workspace.routine.learnedBoards||[])].map(s=>s.board).slice(0,24);
  const targeting=`Tecnologias confirmadas no perfil, usadas apenas para pesquisa: ${JSON.stringify(technologies.slice(0,10))}. Experiência total declarada: ${workspace.profile.confirmed&&workspace.profile.years!==null?workspace.profile.years+' ano(s)':'não confirmada'}. Pesquise combinações dos cargos com essas tecnologias, como backend e full stack quando pertinentes. Priorize requisitos proporcionais à experiência declarada; não presuma senioridade, anos, idiomas ou qualificações ausentes. Procure empresas além destes quadros já conhecidos: ${JSON.stringify(known)}. Não devolva a mesma oportunidade com outro link.`;
  const geography=workspace.filters.remoteAnywhere&&workspace.filters.modalities.includes('Remoto')
    ? `Para vagas REMOTAS, pesquise em todo o Brasil; a cidade do candidato não restringe a sede da empresa. Para vagas presenciais, use somente estas localidades: ${JSON.stringify(workspace.filters.locations)}.`
    : `Localidades: ${JSON.stringify(workspace.filters.locations)}.`;
  const prompt = `${channel} ${targeting} Hoje é ${new Date().toISOString().slice(0,10)}. Publicadas nos últimos ${workspace.filters.ageDays} dias. Cargos: ${JSON.stringify(roles)}. ${geography} Modalidades: ${JSON.stringify(workspace.filters.modalities)}. Priorize vagas no Brasil e vagas remotas que aceitem residentes no Brasil; remoto não significa elegibilidade mundial. Não pesquise listas de vagas, agregadores nem publicações pessoais de recrutadores. Cite até 6 anúncios individuais reais, nunca listas de vagas. Não faça login nem envie candidaturas. Não invente datas, links ou qualificações. Retorne JSON {"jobs":[{"title":"cargo","company":"empresa","url":"URL citada","citationUrl":"fonte Google quando disponível","location":"local publicado","description":"resumo fiel"}]}.`;
  const result = await (dependencies.search || searchCitedUrls)(prompt, userId);
  if (!result.available)
    throw new SourceError(
      "A busca nas empresas precisa de um mecanismo de pesquisa configurado.",
    );
  const jobs: Job[] = [];
  let readable = 0;
  const seen = new Set<string>();
  for (const value of result.urls.slice(0, 6)) {
    if (discoveryBudgetExpired()) break;
    try {
      const url = publicUrl(value).href;
      const ats = detectAts(url);
      if (!emailOnly && ats && !["quickin", "greenhouse", "lever", "ashby", "smartrecruiters"].includes(ats.platform))
        continue;
      const key = canonicalJobUrl(url);
      if (seen.has(key)) continue;
      seen.add(key);
      const page = await (dependencies.readPage || readPublicPage)(url);
      if (page.status >= 400 || canonicalJobUrl(page.url) !== key) continue;
      readable++;
      if(employerPostUrl(page.url)) {
        const job=await jobFromEmployerPost(page,dependencies.readPage || readPublicPage);
        if(job) jobs.push(job);
        continue;
      }
      const records = structuredJobs(page.html);
      if(!emailOnly&&ats?.platform==='quickin'){
        const company=records.length===1?records[0].hiringOrganization?.name:undefined;
        if(typeof company==='string'){
          const j=jobFromQuickinPage({id:`quickin-board:${ats.board}`,type:'manual',board:ats.board!,company,enabled:true,discovery:true,application:false,status:''},page);
          if(j)jobs.push(j);
        }
        continue;
      }
      if(!ats&&!emailOnly){
        const company=records.length===1?records[0].hiringOrganization?.name:undefined;
        if(typeof company==='string'&&wpJobsForm(page)){
          const j=jobFromCompanyPage({id:`company-board:${new URL(page.url).hostname}`,type:'manual',board:new URL(page.url).origin,company,enabled:true,discovery:true,application:false,status:''},page);
          if(j)jobs.push(j);
        }
        continue;
      }
      // A job list must not be turned into an arbitrary individual posting.
      if (records.length !== 1) continue;
      const data = records[0];
      if (
        data.url &&
        (typeof data.url !== "string" ||
          canonicalJobUrl(new URL(data.url, page.url).href) !== key)
      )
        continue;
      const base: Job = {
        id: randomUUID(),
        title: "",
        company: "",
        url,
        source: ats?.platform || "Publicação da empresa",
        description: "",
        location: "Não informado",
        modality: "Não informado",
        level: "Não informado",
        contract: "Não informado",
        salaryMin: null,
        salaryMax: null,
        currency: "",
        skills: [],
        requiredSkills: [],
        requiredYears: null,
        publishedAt: null,
        discoveredAt: new Date().toISOString(),
        saved: false,
        discarded: false,
        origins: [],
        demo: false,
        match: {
          score: 0,
          strengths: [],
          gaps: [],
          blockers: [],
          matchedSkills: [],
          missingSkills: [],
          radar: false,
          explanation: "",
        },
      };
      const job = publicationFromStructured(base, data, page.url);
      if (
        !job ||
        job.availability === "closed" ||
        !job.title.trim() ||
        !job.company.trim() ||
        job.description.length < 80
      )
        continue;
      job.publishedAt =
        typeof data.datePosted === "string" &&
        Number.isFinite(Date.parse(data.datePosted))
          ? new Date(data.datePosted).toISOString()
          : null;
      job.skills = extractSkills(`${job.title} ${job.description}`);
      job.geographicEligibility = job.location;
      if (emailOnly) {
        // The search result cannot supply the recipient. Re-read publisher and
        // employer evidence through the same verifier used immediately before sending.
        job.emailDestination = await verifyEmailDestination(job, undefined,
          target => canonicalJobUrl(target) === canonicalJobUrl(page.url)
            ? Promise.resolve(page) : (dependencies.readPage || readPublicPage)(target));
      }
      jobs.push(job);
    } catch {
      // A failed publisher page never becomes a job copied from model text.
    }
  }
  if (result.urls.length && !readable && !jobs.length)
    throw new SourceError(
      "As referências encontradas não confirmaram páginas oficiais legíveis. A busca será reavaliada.",
    );
  return {
    jobs,
    cached: false,
    checkedAt: new Date().toISOString(),
    method: "publicações oficiais verificadas",
  };
}

export function discoverCorporateEmailCareers(workspace:Workspace,userId?:string,dependencies:Dependencies={}) {
  return discoverOfficialCareers(workspace,userId,dependencies,true);
}
