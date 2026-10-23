import { load, type CheerioAPI } from "cheerio";
import { z } from "zod";
import type { Job } from "../shared/types";
import { readPublicPage, type PublicPage } from "./public-web";
import { normalized, companyIdentity } from "./job-identity";
import { RequestError } from "./errors";
import {ablerEmailDestination} from './abler-discovery';

function publishedText($: CheerioAPI) {
  $("script,style,noscript").remove();
  // Cloudflare renders these public email addresses with the same XOR decoding in the browser.
  for (const node of $("[data-cfemail]").toArray()) {
    const encoded = $(node).attr("data-cfemail") || "";
    if (!/^(?:[a-f0-9]{2}){3,255}$/i.test(encoded)) continue;
    const bytes = Buffer.from(encoded, "hex"),
      key = bytes[0];
    const email = Buffer.from(
      bytes.subarray(1).map((value) => value ^ key),
    ).toString("utf8");
    if (z.email().safeParse(email).success) $(node).text(email);
  }
  return $("body").text().replace(/\s+/g, " ");
}
function publicationDate(html:string, title:string) {
  const $=load(html), dates=new Set<string>();
  for(const node of $('script[type="application/ld+json"]').toArray()) {
    try {
      const value=JSON.parse($(node).text());
      for(const r of (Array.isArray(value)?value:value['@graph'] || [value])) {
        if(!['JobPosting','SocialMediaPosting'].includes(r['@type']) || !normalized(r.title || r.headline || '').includes(normalized(title))) continue;
        const at=Date.parse(r.datePosted || r.datePublished);
        if(Number.isFinite(at) && at<=Date.now()) dates.add(new Date(at).toISOString());
      }
    }catch{ /* Unknown dates remain unknown. */ }
  }
  return dates.size===1 ? [...dates][0] : undefined;
}
async function employerPublication(job: Job, html: string, domain: string, email: string, read: (url: string) => Promise<PublicPage>) {
  const source=new URL(job.url);
  if(!/(^|\.)linkedin\.com$/.test(source.hostname) || !/^\/(?:posts\/|feed\/update\/)/.test(source.pathname)) return false;
  const $=load(html);
  const records:Record<string,any>[]=[];
  for(const node of $('script[type="application/ld+json"]').toArray()) {
    try { const value=JSON.parse($(node).text()); records.push(...(Array.isArray(value)?value:value['@graph'] || [value])); } catch { /* Not structured evidence. */ }
  }
  const posts=records.filter(r=>r['@type']==='SocialMediaPosting' && r.author?.['@type']==='Organization' &&
    typeof r.articleBody==='string' && normalized(r.articleBody).includes(normalized(job.title)) && r.articleBody.toLowerCase().includes(email));
  if(posts.length!==1 || typeof posts[0].author.url!=='string') return false;
  const author=new URL(posts[0].author.url);
  if(author.protocol!=='https:' || !/(^|\.)linkedin\.com$/.test(author.hostname) || !/^\/company\/[^/]+\/?$/.test(author.pathname) || author.username || author.password) return false;
  const organization=await read(author.href);
  if(organization.status>=400 || new URL(organization.url).hostname!==author.hostname) return false;
  const org=load(organization.html);
  const identity=companyIdentity(job.company);
  const sameName=companyIdentity(org('h1').first().text())===identity || companyIdentity(posts[0].author.name || '')===identity;
  // A company rename may leave the original brand in the email/site domain.
  // This alias is allowed only with the exact registered domain and the same
  // organizational author whose post and profile both publish the address.
  const sameBrand=identity.replace(/\s+/g,'')===domain.split('.')[0].replace(/-/g,'');
  if(!sameName && !sameBrand) return false;
  const website=org('a[href]').toArray().some(n=>{
    try {
      let u=new URL(org(n).attr('href')!,organization.url);
      if(/(^|\.)linkedin\.com$/.test(u.hostname) && u.pathname==='/redir/redirect' && u.searchParams.has('url')) u=new URL(u.searchParams.get('url')!);
      return u.protocol==='https:' && !u.username && !u.password && [domain,`www.${domain}`].includes(u.hostname);
    }catch{return false;}
  });
  return website && publishedText(org).toLowerCase().includes(email);
}

export function emailDestinationReady(job: Job) {
  const destination = job.emailDestination;
  return (
    !!destination &&
    destination.publicationUrl === job.url &&
    z.email().safeParse(destination.email).success &&
    Number.isFinite(Date.parse(destination.verifiedAt)) &&
    Date.parse(destination.verifiedAt) <= Date.now() &&
    Date.parse(destination.expiresAt) > Date.now()
  );
}
/** Public publisher evidence only; neither the browser nor AI may supply a recipient. */
export async function verifyEmailDestination(
  job: Job,
  employerUrl?: string,
  read: (url: string) => Promise<PublicPage> = readPublicPage,
): Promise<NonNullable<Job["emailDestination"]>> {
  const publication = await read(job.url);
  const abler=ablerEmailDestination(job,publication);
  if(abler)return abler;
  const $ = load(publication.html);
  const text = publishedText($);
  if (
    publication.status >= 400 ||
    !normalized(text).includes(normalized(job.title)) ||
    !normalized(text).includes(normalized(job.company)) ||
    /(?:vaga|oportunidade) (?:encerrada|nao esta recebendo)|not accepting applications/i.test(
      normalized(text),
    )
  )
    throw new RequestError(
      "A publicação não confirmou uma vaga ativa com esse cargo e empresa.",
    );
  if (
    !/candidatura por e[- ]?mail|envie (?:seu |o )?curriculo|enviar curriculo por e[- ]?mail|send (?:your )?(?:resume|cv)/i.test(
      normalized(text),
    )
  )
    throw new RequestError("O anúncio não informa candidatura por e-mail.");
  const addresses = new Set(
    (
      text.match(
        /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      ) || []
    ).map((value) => value.toLowerCase()),
  );
  if (addresses.size !== 1)
    throw new RequestError(
      "O anúncio não oferece um único destinatário inequívoco.",
    );
  const email = [...addresses][0];
  if (!z.email().safeParse(email).success)
    throw new RequestError("Endereço de candidatura inválido.");
  const domain = email.split("@")[1];
  if (
    /^(gmail\.com|outlook\.com|hotmail\.com|yahoo\.com|live\.com)$/.test(domain)
  )
    throw new RequestError(
      "Este destinatário exige validação adicional da empresa.",
    );
  const employer = new URL(employerUrl || `https://${domain}/`);
  if (
    employer.protocol !== "https:" ||
    employer.username ||
    employer.password ||
    ![domain, `www.${domain}`].includes(employer.hostname) ||
    employer.port
  )
    throw new RequestError(
      "O site de confirmação precisa pertencer ao domínio do destinatário.",
    );
  // A job published by the employer's organization is primary evidence. Match
  // the organization name, its registered website domain and repeated email;
  // a recruiter's personal post or an unrelated company page never qualifies.
  if(await employerPublication(job,publication.html,domain,email,read)) return {
    email,publicationUrl:job.url,employerUrl:employer.href,
    publishedAt:publicationDate(publication.html,job.title),
    verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7*86400000).toISOString(),
  };
  const companyPage = await read(employer.href);
  const companyUrl = new URL(companyPage.url);
  const companyDom = load(companyPage.html);
  const companyText = publishedText(companyDom);
  if (
    companyPage.status >= 400 ||
    ![domain, `www.${domain}`].includes(companyUrl.hostname) ||
    companyUrl.protocol !== "https:" ||
    !normalized(companyText).includes(normalized(job.company)) ||
    !companyText.toLowerCase().includes(email)
  )
    throw new RequestError(
      "O site da empresa não confirmou o endereço divulgado para essa vaga.",
    );
  return {
    email,
    publishedAt:publicationDate(publication.html,job.title),
    publicationUrl: job.url,
    employerUrl: companyPage.url,
    verifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
}
