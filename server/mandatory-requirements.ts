import {load} from 'cheerio';
import {extractSkills} from './engine';
import {createHash} from 'node:crypto';
const cache=new Map<string,string[]>();
const optional=/desejav|diferencial|opcional|preferencial|nice to have|preferred|nao (?:e |sao )?(?:necessari|exig|obrigat)|not (?:required|mandatory)/;
const required=/obrigatori|indispensavel|imprescindivel|eliminatori|must[- ]have|\brequired\b|deve (?:ter|possuir|dominar)|exige[- ]se|\bexigid[oa]s?\b|necessari|requerid[oa]/;
const normalized=(line:string)=>line.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^[\s•*#✨📋🎯-]+/u,'');
/** Only explicit mandatory wording counts. A generic requirements list is not
 * evidence that every listed technology is an eliminatory condition. */
export function mandatoryRequirementLines(html:string){
 const key=createHash('sha256').update(html).digest('hex'),cached=cache.get(key);if(cached)return [...cached];
 const $=load(html);$('br').replaceWith('\n');$('p,li,h1,h2,h3,h4,h5,h6,div').each((_i,n)=>{$(n).append('\n');});
 const lines=$.text().split(/\n|;\s*|[.!?]\s+(?=(?:Diferencia|Desej|Obrigat|Must|Nice|Prefer))|,\s*(?=(?:mas |por[eé]m )?(?:desej[aá]vel|diferencial|opcional|obrigat[oó]rio))/i).map(l=>l.trim()).filter(Boolean);
 const result:string[]=[];let mandatorySection=false,optionalSection=false;
 for(const line of lines){
  const n=normalized(line);
  if(/^(?:diferenciais|requisitos desejaveis|experiencias desejaveis|nice to have|preferred skills|bonus|beneficios|what we offer)(?:\s*:|\s*$)/.test(n)){optionalSection=true;mandatorySection=false;continue;}
  if(/^(?:requisitos obrigatorios|qualificacoes obrigatorias|(?:mandatory|required|minimum) (?:skills|requirements|qualifications)|must[- ]haves?)\s*:?$/.test(n)){mandatorySection=true;optionalSection=false;continue;}
  if(/^(?:requisitos(?: e qualificacoes)?|qualifications(?: and job requirements)?|responsabilidades|atividades|requirements)\s*:?$/.test(n)){mandatorySection=false;optionalSection=false;continue;}
  if(optionalSection)continue;
  if(optional.test(n)){
   if(!required.test(n))continue;
   // Mixed clauses must preserve the actual mandatory part, e.g.
   // "SQL required, React preferred" or "Obrigatório C#, .NET, desejável AWS".
   let clauseRequired=mandatorySection;
   for(const clause of line.split(/,\s*|\s+(?:mas|porem|porém|but)\s+/i)){
    const part=normalized(clause);
    if(optional.test(part)){clauseRequired=false;continue;}
    if(required.test(part))clauseRequired=true;
    if(clauseRequired)result.push(clause);
   }
   continue;
  }
  if(mandatorySection||required.test(n))result.push(line);
 }
 if(cache.size>=512)cache.delete(cache.keys().next().value!);cache.set(key,result);return [...result];
}
export function mandatorySkillGroups(html:string){
 return mandatoryRequirementLines(html).flatMap(line=>line.split(/\s*(?:,|\be\b|\band\b|&)\s*/i).flatMap(clause=>{
  const skills=extractSkills(clause);if(!skills.length)return [];
  return /\bou\b|\bor\b/i.test(clause)?[skills]:skills.map(skill=>[skill]);
 }));
}
export function mandatoryTechnicalSkills(html:string){
 return [...new Set(mandatorySkillGroups(html).filter(group=>group.length===1).flat())];
}
