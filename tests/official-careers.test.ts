import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspace } from "../server/workspace";
import { discoverOfficialCareers, discoverCorporateEmailCareers } from "../server/official-discovery";
import {
  destinationBrowserAllowed,
  independentExecutionAvailable,
} from "../server/ats-registry";
import { resolveApplicationDestinations } from "../server/destination-resolver";
import { submissionRoute } from "../server/submission-routing";
import type { PublicPage } from "../server/public-web";

const url =
  "https://jobs.lever.co/empresa/12345678-1234-1234-1234-123456789012";
const record = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  url,
  title: "Desenvolvedor React",
  hiringOrganization: { name: "Empresa Oficial" },
  description:
    "Desenvolvimento de aplicações React e TypeScript, testes automatizados, revisão de código e integração de serviços REST para a equipe de produtos. Experiência de primeiro emprego aceita. Contratação CLT.",
  jobLocationType: "TELECOMMUTE",
  applicantLocationRequirements: { name: "Brasil" },
  datePosted: "2026-10-20T08:00:00Z",
};
const page = (current = url, data: unknown = record): PublicPage => ({
  url: current,
  status: 200,
  contentType: "text/html",
  html: `<h1>Desenvolvedor React</h1><p>Empresa Oficial</p><script type="application/ld+json">${JSON.stringify(data)}</script><form class="application-form"><input type="file" name="resume"></form>`,
});
function workspace() {
  const w = createWorkspace("Pessoa privada", "private@example.test");
  w.filters.titles = ["Desenvolvedor React"];
  w.filters.modalities = ["Remoto"];
  return w;
}
afterEach(() => vi.unstubAllEnvs());

describe("Busca e envio direto nas empresas", () => {
  it('discovers an individually verified new Quickin board using confirmed technologies and experience without personal identifiers',async()=>{
    const target='https://jobs.quickin.io/newcompany/jobs/6ad64c6582963200138f28c0';
    const w=workspace();w.profile.confirmed=true;w.profile.skills=['C#','.NET','Angular'];w.profile.years=1;
    const search=vi.fn(async(_prompt:string)=>({available:true,urls:[target]}));
    const data={...record,url:target,title:'Desenvolvedor .NET',hiringOrganization:{name:'Empresa Oficial'}};
    const result=await discoverOfficialCareers(w,undefined,{search,readPage:async()=>({...page(target,data),html:`<script type="application/ld+json">${JSON.stringify(data)}</script><a href="${target}/apply">Candidatar-se</a>`})});
    expect(result.jobs).toHaveLength(1);expect(result.jobs[0].origins[0].source).toBe('quickin');
    expect(search.mock.calls[0][0]).toContain('.NET');expect(search.mock.calls[0][0]).toContain('1 ano(s)');expect(search.mock.calls[0][0]).not.toContain(w.profile.email);
  });
  it('pesquisa vagas por e-mail separadamente e confirma o endereço no anúncio e no site da empresa',async()=>{
    const publication='https://empresa.example/carreiras/desenvolvedor-react';
    const emailRecord={...record,url:publication,description:record.description+' Envie seu currículo para talentos@empresa.example.'};
    const search=vi.fn(async(_prompt:string)=>({available:true,urls:[publication]}));
    const result=await discoverCorporateEmailCareers(workspace(),undefined,{search,readPage:async(target)=>target===publication
      ? {...page(publication,emailRecord),html:`<h1>${record.title}</h1><p>Empresa Oficial ${emailRecord.description}</p><script type="application/ld+json">${JSON.stringify(emailRecord)}</script>`}
      : {...page(target,{}),html:'<h1>Empresa Oficial</h1><p>Envie currículo para talentos@empresa.example</p>'}});
    expect(search.mock.calls[0][0]).toContain('exclusivamente');
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({publishedAt:new Date(record.datePosted).toISOString(),emailDestination:{email:'talentos@empresa.example'}});
    const refused=await discoverCorporateEmailCareers(workspace(),undefined,{search,readPage:async(target)=>({...page(target,emailRecord),html:'<h1>Empresa Oficial</h1><p>Apenas contato comercial</p>'})});
    expect(refused.jobs).toHaveLength(0);
  });
  it('descobre publicação da empresa e confere o canal por e-mail sem cadastro manual',async()=>{
    const postUrl='https://www.linkedin.com/posts/employer_activity-123';
    const organization='https://www.linkedin.com/company/employer/';
    const body='Estamos com oportunidade aberta para Desenvolvedor React! Contratação CLT, 100% remoto. Desenvolvimento React e TypeScript, APIs REST e Git. Envie seu currículo para talentos@empresa.example.';
    const post={'@type':'SocialMediaPosting',headline:'Estamos com oportunidade aberta para Desenvolvedor React!',articleBody:body,datePublished:'2026-10-20T08:00:00Z',author:{'@type':'Organization',name:'Empresa Oficial',url:organization}};
    const readPage=vi.fn(async(u:string)=>u===postUrl?{...page(postUrl,post),html:`<p>Empresa Oficial ${body}</p><script type="application/ld+json">${JSON.stringify(post)}</script>`}:{...page(u,{}),html:'<h1>Empresa Oficial</h1><a href="https://empresa.example/">Site da empresa</a><p>talentos@empresa.example</p>'});
    const result=await discoverOfficialCareers(workspace(),undefined,{search:async()=>({urls:[postUrl],available:true}),readPage});
    expect(result.jobs).toHaveLength(1);expect(result.jobs[0]).toMatchObject({title:'Desenvolvedor React',company:'Empresa Oficial',modality:'Remoto',publishedAt:'2026-10-20T08:00:00.000Z',emailDestination:{email:'talentos@empresa.example'}});
    expect(result.jobs[0].description).toBe(body);
    const personal={...post,author:{'@type':'Person',name:'Recrutador',url:organization}};
    const rejected=await discoverOfficialCareers(workspace(),undefined,{search:async()=>({urls:[postUrl],available:true}),readPage:async()=>({...page(postUrl,personal),html:`<p>${body}</p><script type="application/ld+json">${JSON.stringify(personal)}</script>`})});
    expect(rejected.jobs).toHaveLength(0);
  });
  it("confirma os dados na publicação, preserva datas e não envia dados pessoais à busca", async () => {
    const search = vi.fn(async () => ({ urls: [url, url], available: true }));
    const readPage = vi.fn(async () => page());
    const result = await discoverOfficialCareers(workspace(), undefined, {
      search,
      readPage,
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      company: "Empresa Oficial",
      location: "Brasil",
      modality: "Remoto",
      publishedAt: new Date(record.datePosted).toISOString(),
      salaryMin: null,
    });
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.join(" ")).not.toContain(
      "private@example.test",
    );
    expect(search.mock.calls[0]?.join(" ")).not.toContain("Pessoa privada");
  });
  it("não transforma texto da IA, páginas de listas e vagas encerradas em anúncios", async () => {
    for (const data of [
      [],
      [record, record],
      { ...record, validThrough: "2020-01-01" },
      { ...record, url: url.replace("empresa", "outra") },
    ]) {
      const result = await discoverOfficialCareers(workspace(), undefined, {
        search: async () => ({ urls: [url], available: true }),
        readPage: async () => page(url, data),
      });
      expect(result.jobs).toHaveLength(0);
    }
  });
  it("recusa busca indisponível e URLs sem publicação oficial reconhecida", async () => {
    await expect(
      discoverOfficialCareers(workspace(), undefined, {
        search: async () => ({ urls: [], available: false }),
      }),
    ).rejects.toThrow("mecanismo");
    const readPage = vi.fn();
    await expect(
      discoverOfficialCareers(workspace(), undefined, {
        search: async () => ({
          urls: ["https://example.com/jobs/123"],
          available: true,
        }),
        readPage,
      }),
    ).rejects.toThrow("oficiais");
    // Unknown company domains may be inspected for the implemented native form;
    // the URL alone never creates a job or grants submission.
    expect(readPage).toHaveBeenCalledOnce();
  });
  it("libera somente plataformas explícitas e confere a plataforma contra o domínio", () => {
    vi.stubEnv("ATS_BROWSER_AUTHORIZED", "");
    vi.stubEnv("ATS_PUBLIC_FORM_PLATFORMS", "lever,*,gupy,company");
    vi.stubEnv("ATS_EXECUTION_LOCAL", "true");
    vi.stubEnv("VERCEL", "");
    expect(independentExecutionAvailable()).toBe(true);
    expect(destinationBrowserAllowed({ url, platform: "lever" })).toBe(true);
    expect(
      destinationBrowserAllowed({
        url: "https://evil.example/jobs/1",
        platform: "lever",
      }),
    ).toBe(false);
    expect(destinationBrowserAllowed({ url, platform: "ashby" })).toBe(false);
    expect(
      destinationBrowserAllowed({
        url: "https://empresa.gupy.io/jobs/1",
        platform: "gupy",
      }),
    ).toBe(false);
    expect(
      destinationBrowserAllowed({
        url: "https://empresa.com/jobs/1",
        platform: "company",
      }),
    ).toBe(false);
  });
  it("resolve e roteia a publicação diretamente sem conta de portal e sem ignorar prazo", async () => {
    vi.stubEnv("ATS_BROWSER_AUTHORIZED", "");
    vi.stubEnv("ATS_PUBLIC_FORM_PLATFORMS", "lever");
    vi.stubEnv("ATS_EXECUTION_LOCAL", "true");
    vi.stubEnv("VERCEL", "");
    const w = workspace();
    w.routine.destinationPolicy = "official";
    const { jobs } = await discoverOfficialCareers(w, undefined, {
      search: async () => ({ urls: [url], available: true }),
      readPage: async () => page(),
    });
    const resolved = await resolveApplicationDestinations(jobs[0], {
      readPage: async () => page(),
    });
    expect(resolved.destinations?.[0]).toMatchObject({
      method: "browser",
      formFound: true,
    });
    expect(submissionRoute(w, resolved, [])?.method).toBe("ats_browser");
    resolved.destinations![0].expiresAt = "2020-01-01";
    expect(submissionRoute(w, resolved, [])).toBeNull();
  });
  it("o modo oficial não usa uma sessão Gupy disponível como alternativa", async () => {
    const w = workspace();
    w.sources.push({
      id: "gupy",
      type: "portal",
      board: "gupy",
      company: "Gupy",
      enabled: true,
      discovery: true,
      application: true,
      status: "Conectada",
    });
    const result = await discoverOfficialCareers(w, undefined, {
      search: async () => ({ urls: [url], available: true }),
      readPage: async () => page(),
    });
    const job = {
      ...result.jobs[0],
      url: "https://empresa.gupy.io/jobs/1",
      resolution: { state: "partial" },
    } as (typeof result.jobs)[number];
    expect(submissionRoute(w, job, ["gupy"])?.method).toBe("browser");
    w.routine.destinationPolicy = "official";
    expect(submissionRoute(w, job, ["gupy"])).toBeNull();
  });
});
