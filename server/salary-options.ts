import {normalized} from './job-identity';
/** Select only a published BRL band containing the candidate's confirmed amount.
 * Adjacent inclusive bands share an endpoint; prefer the band starting there.
 * Other overlaps, currencies, annual/hourly amounts and unclear prose stay pending. */
export function salaryOption(question:string,amount:number,options:string[]):string|undefined {
 if(!Number.isFinite(amount)||amount<=0||!/pretensao salarial|expectativa salarial|salary expectation|expected salary/.test(normalized(question))||/anual|annual|por hora|hourly|\busd\b|\beur\b|d[oó]lar|euro/i.test(question))return;
 const number=(v:string)=>Number(v.replace(/\./g,'').replace(',','.'));
 const matches=options.flatMap(label=>{
  if(/anual|annual|por hora|hourly|\busd\b|\beur\b|d[oó]lar|euro/i.test(label))return [];
  const n=label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim(),range=n.match(/^(?:de|entre)\s*(?:r\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)\s*(?:a|ate|e|[-–])\s*(?:r\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)$/);
  if(!range)return [];
  const min=number(range[1]),max=number(range[2]);
  return min<=amount&&amount<=max&&min<max?[{label,min,max}]:[];
 });
 if(matches.length===1)return matches[0].label;
 if(matches.length===2){const [a,b]=matches.sort((a,b)=>a.min-b.min);if(a.max===amount&&b.min===amount)return b.label;}
 return;
}
