import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
const prior=parse(await readFile('.env.antigravity-owner.local'));
const fresh=parse(await readFile('.env.oidc-search-probe.local'));
for(const key of ['VERCEL_OIDC_TOKEN','VERCEL_PROJECT_ID','VERCEL_ORG_ID'])if(fresh[key])process.env[key]=fresh[key];
for(const key of ['ANTIGRAVITY_ENABLED','ANTIGRAVITY_OWNER_ID'])if(prior[key]&&prior[key]!=='[SENSITIVE]')process.env[key]=prior[key];
if(!process.env.ANTIGRAVITY_OWNER_ID||!process.env.VERCEL_OIDC_TOKEN)throw new Error('Configuração de diagnóstico não disponível.');
const {searchAntigravity}=await import('../server/antigravity');
const result=await searchAntigravity(process.env.ANTIGRAVITY_OWNER_ID,
  'Execute Google Search para encontrar anúncios individuais de Desenvolvedor .NET ou Fullstack .NET Angular REMOTO que aceitem candidatos no Brasil. Hoje é 22/10/2026. Últimos 14 dias. Pesquise Greenhouse, Ashby e SmartRecruiters e cite os URLs encontrados. A sede da empresa pode ser qualquer cidade; Ilhéus não restringe uma vaga remota. Não faça login nem envie candidaturas. Retorne JSON jobs com cargo, empresa, URL, local e resumo fiel. O servidor verificará o anúncio original.');
const diagnostic={at:new Date().toISOString(),searchPerformed:result.searchPerformed,urls:[...result.verifiedUrls],jobs:result.jobs};
await writeFile('artifacts/official-search-probe-2026-10-22.json',JSON.stringify(diagnostic,null,2));
console.log(JSON.stringify(diagnostic,null,2));
