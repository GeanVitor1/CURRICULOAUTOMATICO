import type {Job, Source} from './types';

/** Product source selection, not a claim about the reputation of a company. */
export const SOURCE_POLICY_MESSAGE = 'Esta fonte foi retirada da automação. Use um anúncio direto em um portal ou plataforma de recrutamento permitida.';
export function removedJobSource(value: string) {
  let decoded=value;
  try{decoded=decodeURIComponent(value);}catch{}
  return /(?:^|[^a-z0-9])global[\s_.-]*t[\s_.-]*i(?=$|[^a-z0-9])/i.test(decoded);
}
const publisherHosts = [
  'gupy.io', 'linkedin.com', 'infojobs.com.br', 'glassdoor.com',
  'glassdoor.com.br', 'indeed.com', 'indeed.com.br',
  'boards.greenhouse.io', 'job-boards.greenhouse.io',
  'boards.eu.greenhouse.io', 'job-boards.eu.greenhouse.io',
  'jobs.lever.co', 'jobs.eu.lever.co', 'jobs.ashbyhq.com',
  'jobs.smartrecruiters.com', 'jobs.quickin.io', 'candidatos.abler.com.br',
];
export function permittedPublicationUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      !removedJobSource(url.hostname + url.pathname) && publisherHosts.some(host =>
        url.hostname === host || (['gupy.io','linkedin.com','infojobs.com.br','glassdoor.com','glassdoor.com.br','indeed.com','indeed.com.br'].includes(host) && url.hostname.endsWith('.' + host)));
  } catch { return false; }
}
export function permittedJobSource(job: Pick<Job,'url'|'company'>) {
  return !removedJobSource(job.company) && permittedPublicationUrl(job.url);
}
export function permittedDiscoverySource(source: Source) {
  if ([source.id, source.board, source.company].some(removedJobSource)) return false;
  if (source.type === 'portal') return ['gupy','linkedin','infojobs','glassdoor','indeed'].includes(source.board);
  if (['greenhouse','lever','ashby','smartrecruiters'].includes(source.type)) return true;
  return source.type === 'manual' && (
    ['official-careers','corporate-email-careers','official-abler-email'].includes(source.id) ||
    (source.id.startsWith('quickin-board:') && /^[a-z0-9_-]{1,100}$/i.test(source.board)));
}
