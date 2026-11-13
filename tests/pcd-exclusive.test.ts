import {expect,it} from 'vitest';
import {isPcdExclusive} from '../server/engine';
it.each([['Desenvolvedor .Net - PcD | Maxpar',''],['Vaga exclusiva para PcD - Analista',''],['Desenvolvedor Java','Esta vaga é exclusiva para pessoas com deficiência.'],['Analista de Sistemas','Vaga destinada a PcD.'],['Afirmativa para pessoas com deficiência - QA','']])('detecta vaga PcD: %s',(t,d)=>expect(isPcdExclusive(t,d)).toBe(true));
it.each([['Desenvolvedor .NET Pleno','Valorizamos a diversidade e incentivamos a candidatura de pessoas com deficiência.'],['Analista de Sistemas','Todas as vagas também são abertas para PcD.']])('não confunde inclusão com exclusividade: %s',(t,d)=>expect(isPcdExclusive(t,d)).toBe(false));
