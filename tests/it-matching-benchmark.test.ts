import {expect,it} from 'vitest';
import {evaluate} from '../scripts/evaluate-it-matching';
it('benchmark de vagas de TI: sem recomendações erradas e cobertura mínima de 90%',()=>{
 const r=evaluate(true);
 expect(r.errors.filter(e=>e.startsWith('RECOMENDOU'))).toEqual([]);
 expect(r.recall).toBeGreaterThanOrEqual(0.9);
});
