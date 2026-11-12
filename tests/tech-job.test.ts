import {describe,expect,it} from 'vitest';
import {isTechJob} from '../server/engine';
describe('isTechJob',()=>{
 it.each(['Desenvolvedor .NET Pleno','Analista de Sistemas Java - (Sustentação)','Analista .NET','Engenheiro de Software','Front-end Developer','Analista de Dados Jr','QA Analyst','DevOps Engineer','Suporte Técnico N2','Analista de Infraestrutura','Estágio em TI','Cientista de Dados','Help Desk','Analista de BI','Programador PHP','Tech Lead'])('aceita %s',t=>expect(isTechJob(t)).toBe(true));
 it.each(['Auxiliar administrativo','Vendedor','Recepcionista','Técnico de enfermagem','Operador de caixa','Motorista','Auxiliar de logística','Analista Financeiro','Analista de RH'])('rejeita %s',t=>expect(isTechJob(t)).toBe(false));
});
