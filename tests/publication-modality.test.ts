import {expect,it} from 'vitest';
import {publicationFromStructured} from '../server/destination-page';
import type {Job} from '../shared/types';
const original={} as Job;
const data={title:'Assistente administrativo',hiringOrganization:{name:'Empresa'},description:'Rotinas administrativas e atendimento. Modelo de trabalho 100% remoto, contratação CLT.'};
it('retains an explicit remote work model from the actual publisher when JobPosting omits jobLocationType',()=>{
 expect(publicationFromStructured(original,data,'https://empresa.example/jobs/1')?.modality).toBe('Remoto');
});
it('supports the schema array form for TELECOMMUTE and keeps truly missing modalities unknown',()=>{
 expect(publicationFromStructured(original,{...data,description:'Rotinas administrativas e atendimento.',jobLocationType:['TELECOMMUTE']},'https://empresa.example/jobs/1')?.modality).toBe('Remoto');
 expect(publicationFromStructured(original,{...data,description:'Rotinas administrativas e atendimento.'},'https://empresa.example/jobs/1')?.modality).toBe('Não especificado');
});
