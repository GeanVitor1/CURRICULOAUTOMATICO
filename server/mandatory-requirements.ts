import {load} from 'cheerio';
import {extractSkills} from './engine';
/** Requirements headings are public evidence. Optional/alternative skills do not
 * become a conjunction of mandatory qualifications. Never infer from a title. */
export function mandatoryTechnicalSkills(html:string){
 const $=load(html);$('br').replaceWith('\n');$('p,li,h1,h2,h3,h4,h5,h6,div').each((_i,n)=>{$(n).append('\n');});
 const text=$.text();
 const section=text.match(/(?:requisitos\s+obrigat[oó]rios|requisitos\s+e\s+qualifica[cç][oõ]es|os requisitos para esta posi[cç][aã]o incluem|qualifications and job requirements|(?:^|\n)\s*(?:[✨📋🎯]\s*)?requisitos)\s*:?([\s\S]*?)(?:diferenciais\s*:?|experi[eê]ncias\s+desej[aá]veis|requisitos\s+desej[aá]veis|nice to have|preferred skills|what we offer|benef[ií]cios|$)/i)?.[1];
 if(!section)return [];
 return extractSkills(section.split('\n').filter(l=>!/(?:desej[aá]vel|diferencial|opcional|preferencial|\bor\b|\bou\b|n[aã]o (?:[eé] )?(?:necess[aá]ri|exig|obrigat))/i.test(l)).join('\n'));
}
