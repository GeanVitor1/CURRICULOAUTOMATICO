import {expect,it} from 'vitest';
import {evaluate,evaluateReal} from '../scripts/evaluate-it-matching';
it('benchmark de vagas de TI: sem recomendações erradas e cobertura mínima de 90%',()=>{
 const r=evaluate(true);
 expect(r.errors.filter(e=>e.startsWith('RECOMENDOU'))).toEqual([]);
 expect(r.recall).toBeGreaterThanOrEqual(0.9);
});

it('vagas reais da Gupy: não pode piorar abaixo do patamar medido (80% precisão / 78% cobertura)',async()=>{
 const r=await evaluateReal();
 expect(r.precision).toBeGreaterThanOrEqual(0.78);
 expect(r.recall).toBeGreaterThanOrEqual(0.75);
},180000);
