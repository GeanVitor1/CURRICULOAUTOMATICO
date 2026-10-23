import { afterEach, describe, expect, it, vi } from "vitest";
import {
  comparePublications,
  expandSearchTitles,
  canonicalJobUrl,
} from "../server/job-identity";
import { resolveApplicationDestinations } from "../server/destination-resolver";
import { publicAddress, publicUrl } from "../server/public-web";
import {
  destinationBrowserAllowed,
  detectAts,
  publicJob,
} from "../server/ats-registry";
import { approvedFieldAnswer } from "../server/approved-answers";
import { defaultProfile } from "../shared/types";
import {
  applicationLinks,
  publicationFromStructured,
} from "../server/destination-page";
import type { Job } from "../shared/types";

const description =
  "Desenvolvimento de aplicações web com React e TypeScript para produtos financeiros. A equipe integra serviços REST, escreve testes automatizados, revisa código, documenta decisões técnicas e participa do planejamento de entregas junto com profissionais de produto e design. Experiência em Git e acessibilidade é necessária. Também apoiará melhorias de desempenho, investigação de incidentes, monitoramento de métricas operacionais, organização do backlog, análise de requisitos funcionais e manutenção de componentes reutilizáveis.";
export function fixtureJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "vacancy-1",
    title: "Desenvolvedor React",
    company: "Empresa ABC",
    source: "LinkedIn",
    url: "https://www.linkedin.com/jobs/view/123456",
    description,
    location: "São Paulo, Brasil",
    modality: "Remoto",
    level: "Júnior",
    contract: "CLT",
    salaryMin: null,
    salaryMax: null,
    currency: "BRL",
    skills: ["React", "TypeScript", "Git"],
    requiredSkills: [],
    requiredYears: null,
    publishedAt: null,
    discoveredAt: new Date().toISOString(),
    saved: false,
    discarded: false,
    origins: [
      {
        source: "portal",
        url: "https://www.linkedin.com/jobs/view/123456",
        id: "linkedin:123456",
      },
    ],
    match: {
      score: 90,
      strengths: [],
      gaps: [],
      blockers: [],
      matchedSkills: [],
      missingSkills: [],
      radar: false,
      explanation: "",
    },
    demo: false,
    ...overrides,
  };
}
const alternative = () =>
  fixtureJob({
    url: "https://job-boards.greenhouse.io/empresaabc/jobs/5678",
    source: "Greenhouse",
    origins: [
      {
        source: "greenhouse",
        url: "https://job-boards.greenhouse.io/empresaabc/jobs/5678",
        id: "empresaabc:5678",
      },
    ],
  });
afterEach(() => vi.unstubAllEnvs());
describe("Identidade da vaga e fontes independentes", () => {
  it("confirma publicações equivalentes com empresa, local e descrição suficientes", () =>
    expect(comparePublications(fixtureJob(), alternative()).verified).toBe(
      true,
    ));
  it.each([
    { company: "Outra empresa" },
    { level: "Sênior" },
    { location: "New York, United States" },
    { modality: "Presencial" },
    { description: "Uma vaga de React." },
  ])("mantém separada uma publicação ambígua: %j", (changes) =>
    expect(
      comparePublications(fixtureJob(), { ...alternative(), ...changes })
        .verified,
    ).toBe(false),
  );
  it("não une IDs diferentes do mesmo quadro nem requisições conflitantes", () => {
    expect(
      comparePublications(alternative(), {
        ...alternative(),
        url: "https://job-boards.greenhouse.io/empresaabc/jobs/9999",
        origins: [
          {
            source: "greenhouse",
            id: "empresaabc:9999",
            url: "https://job-boards.greenhouse.io/empresaabc/jobs/9999",
          },
        ],
      }).verified,
    ).toBe(false);
    expect(
      comparePublications(fixtureJob({ requisitionId: "A" }), {
        ...alternative(),
        requisitionId: "B",
      }).verified,
    ).toBe(false);
  });
  it("usa requisição oficial com identidade da empresa e não só o título", () => {
    expect(
      comparePublications(fixtureJob({ requisitionId: "REF-1" }), {
        ...alternative(),
        requisitionId: "REF-1",
        description: "Descrição curta.",
      }).verified,
    ).toBe(true);
  });
  it("normaliza rastreadores preservando parâmetros que identificam a vaga", () =>
    expect(
      canonicalJobUrl("https://example.com/job?gh_jid=1&utm_source=x#apply"),
    ).toBe("https://example.com/job?gh_jid=1"));
  it("expande títulos para descoberta sem inventar senioridade", () => {
    expect(expandSearchTitles(["Desenvolvedor React Júnior"])).toContain(
      "frontend developer",
    );
    expect(
      expandSearchTitles(["Desenvolvedor React Júnior"]).join(" "),
    ).not.toMatch(/arquiteto|senior/i);
  });
  it("não publica currículo, candidatura ou compatibilidade pessoal no catálogo", () => {
    const clean = publicJob(
      fixtureJob({ saved: true, application: { id: "private" } as any }),
    );
    expect(clean.application).toBeUndefined();
    expect(clean.saved).toBe(false);
    expect(clean.match.score).toBe(0);
  });
});
describe("Resolver de destinos", () => {
  it("prioriza o anúncio publicado sem consumir o orçamento com login ou ajuda a candidatos", () => {
    expect(
      applicationLinks(
        {
          url: "https://empresa.example/careers",
          status: 200,
          contentType: "text/html",
          html: '<a href="https://login.example/Account/Login">Candidate-se</a><a href="/help">Ajuda para candidatos</a><a href="/careers">Carreiras</a><a href="/Detail/1"><span>Desenvolvedor React</span></a>',
        },
        "Desenvolvedor React",
      ),
    ).toEqual([
      "https://empresa.example/Detail/1",
      "https://empresa.example/careers",
    ]);
  });
  it("não presume que um trabalho remoto é elegível para o Brasil", () => {
    const publication = publicationFromStructured(
      fixtureJob(),
      {
        title: "Developer",
        description: "Remote",
        hiringOrganization: { name: "ABC" },
        jobLocationType: "TELECOMMUTE",
      },
      alternative().url,
    );
    expect(publication?.location).toBe("Não informado");
  });
  const page = (job: Job) => ({
    url: job.url,
    status: 200,
    contentType: "text/html",
    html: `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: job.title, description: job.description, hiringOrganization: { name: job.company }, jobLocation: { address: { addressLocality: "São Paulo", addressCountry: "Brasil" } }, jobLocationType: "TELECOMMUTE" })}</script><h1>${job.title}</h1>${job.company}<form><input type="file" name="resume"></form>`,
  });
  it("encontra Greenhouse mesmo quando a origem exige login no LinkedIn", async () => {
    vi.stubEnv("ATS_BROWSER_AUTHORIZED", "greenhouse:empresaabc");
    const result = await resolveApplicationDestinations(fixtureJob(), {
      candidates: [alternative()],
      readPage: async (url) =>
        url.includes("linkedin")
          ? {
              url,
              status: 200,
              contentType: "text/html",
              html: '<input type="password">',
            }
          : page(alternative()),
      search: async () => ({ urls: [], available: true }),
    });
    expect(result.destinations?.[0].platform).toBe("greenhouse");
    expect(result.destinations?.[0].method).toBe("browser");
    expect(
      result.resolution?.consulted.some(
        (item) => item.source === "public_search",
      ),
    ).toBe(true);
  });
  it("rejeita outra empresa encontrada pela busca, mesmo com título igual", async () => {
    const other = { ...alternative(), company: "Outra empresa" };
    const result = await resolveApplicationDestinations(fixtureJob(), {
      readPage: async (url) =>
        url.includes("linkedin")
          ? { url, status: 403, html: "", contentType: "text/html" }
          : page(other),
      search: async () => ({ urls: [other.url], available: true }),
    });
    expect(result.destinations).toEqual([]);
    expect(result.resolution?.state).toBe("partial");
  });
  it("vincula o formulário Lever publicado ao mesmo anúncio com espaços e entidades HTML", async () => {
    const url =
      "https://jobs.lever.co/ciandt/8cde4bd9-6da1-4148-8d6c-4c213926b82b";
    const original = fixtureJob({
      company: "CI&T",
      title: "[ job -  32009] Junior Java Developer , Brasil",
      url,
      source: "Lever",
      origins: [
        {
          source: "lever",
          id: "ciandt:8cde4bd9-6da1-4148-8d6c-4c213926b82b",
          url,
        },
      ],
    });
    const html =
      "<h1>[ job - 32009] Junior Java Developer , Brasil</h1><a>CI&amp;T</a>";
    const resolved = await resolveApplicationDestinations(original, {
      readPage: async (current) => ({
        url: current,
        status: 200,
        contentType: "text/html",
        html:
          html +
          (current === url
            ? '<a href="' + url + '/apply">apply for this job</a>'
            : '<form><input type="file" name="resume"></form>'),
      }),
      search: async () => ({ urls: [], available: true }),
    });
    const form = resolved.destinations?.find(
      (destination) => destination.url === url + "/apply",
    );
    expect(form?.state).toBe("verified");
    expect(form?.formFound).toBe(true);
    expect(form?.method).toBe("assisted"); // Discovery is not an automation grant.
  });
  it.each([
    "https://jobs.lever.co/another/8cde4bd9-6da1-4148-8d6c-4c213926b82b/apply",
    "https://jobs.lever.co/ciandt/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/apply",
    "https://jobs.eu.lever.co/ciandt/8cde4bd9-6da1-4148-8d6c-4c213926b82b/apply",
  ])(
    "não transfere a identidade para outro quadro, ID ou domínio: %s",
    async (applyUrl) => {
      const url =
        "https://jobs.lever.co/ciandt/8cde4bd9-6da1-4148-8d6c-4c213926b82b";
      const original = fixtureJob({
        company: "CI&T",
        url,
        origins: [
          {
            source: "lever",
            id: "ciandt:8cde4bd9-6da1-4148-8d6c-4c213926b82b",
            url,
          },
        ],
      });
      const html = "<h1>Desenvolvedor React</h1><a>CI&amp;T</a>";
      const resolved = await resolveApplicationDestinations(original, {
        readPage: async (current) => ({
          url: current,
          status: 200,
          contentType: "text/html",
          html:
            html +
            (current === url
              ? '<a href="' + applyUrl + '">apply for this job</a>'
              : '<form><input type="file" name="resume"></form>'),
        }),
        search: async () => ({ urls: [], available: true }),
      });
      expect(
        resolved.destinations?.some(
          (destination) => destination.url === applyUrl,
        ),
      ).toBe(false);
    },
  );
  it("informa busca parcial quando indexador não está disponível", async () => {
    const result = await resolveApplicationDestinations(fixtureJob(), {
      readPage: async (url) => ({
        url,
        status: 200,
        contentType: "text/html",
        html: '<input type="password">',
      }),
      search: async () => ({ urls: [], available: false }),
    });
    expect(result.resolution?.state).toBe("partial");
    expect(result.resolution?.complete).toBe(false);
  });
  it("não transforma uma página de divulgação em formulário", async () => {
    const target = alternative();
    const result = await resolveApplicationDestinations(fixtureJob(), {
      candidates: [target],
      readPage: async () => ({
        ...page(target),
        html: page(target).html.replace(/<form>.*<\/form>/, ""),
      }),
      search: async () => ({ urls: [], available: true }),
    });
    expect(result.destinations?.every((item) => !item.formFound)).toBe(true);
  });
});
describe("Rede e respostas aprovadas", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
  ])("recusa endereço não público %s", (ip) =>
    expect(publicAddress(ip)).toBe(false),
  );
  it.each([
    "http://example.com",
    "https://user:password@example.com",
    "https://127.0.0.1",
    "https://example.com:444",
    "https://metadata.google.internal",
  ])("recusa URL perigosa %s", (url) => expect(() => publicUrl(url)).toThrow());
  it("exige autorização por quadro, sem liberar outros empregadores do ATS", () => {
    vi.stubEnv("ATS_BROWSER_AUTHORIZED", "greenhouse:empresaabc");
    expect(
      destinationBrowserAllowed({
        platform: "greenhouse",
        url: alternative().url,
      }),
    ).toBe(true);
    expect(
      destinationBrowserAllowed({
        platform: "greenhouse",
        url: "https://job-boards.greenhouse.io/other/jobs/5678",
      }),
    ).toBe(false);
    expect(detectAts("https://jobs.lever.co.evil.com/company/123")).toBeNull();
  });
  it("reutiliza só respostas confirmadas e exige escopo exato em declarações", () => {
    const url = alternative().url;
    const profile = {
      ...defaultProfile,
      confirmed: true,
      approvedAnswers: [
        {
          id: "1",
          question: "Aceito a política de privacidade",
          aliases: [],
          value: "sim",
          confirmedAt: new Date().toISOString(),
          destinationOrigin: new URL(url).origin,
          destinationUrl: url,
        },
      ],
    };
    expect(
      approvedFieldAnswer("Aceito a política de privacidade", profile, url),
    ).toBe("sim");
    expect(
      approvedFieldAnswer(
        "Aceito a política de privacidade",
        profile,
        url + "1",
      ),
    ).toBeUndefined();
    expect(
      approvedFieldAnswer("Tenho 10 anos de React?", profile, url),
    ).toBeUndefined();
  });
});
