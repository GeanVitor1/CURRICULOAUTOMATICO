import {it,expect} from 'vitest';
import {salaryOption} from '../server/salary-options';
const question='Qual sua pretensão salarial?';
it('maps the confirmed amount to the published band, including a shared endpoint',()=>{
 const options=['De R$ 2.000 a R$3.000','De R$3.000 a R$4.000','De R$4.000 a R$5.000'];
 expect(salaryOption(question,3000,options)).toBe(options[1]);
 expect(salaryOption(question,3500,options)).toBe(options[1]);
 expect(salaryOption(question,5000,options)).toBe(options[2]);
 expect(salaryOption(question,5500,options)).toBeUndefined();
});
it('leaves incompatible units, currencies, unconfirmed amounts and overlapping ranges pending',()=>{
 for(const [q,value,options] of [
  [question,0,['De R$ 2.000 a R$3.000']],
  ['Qual sua pretensão salarial anual?',3000,['De R$ 2.000 a R$3.000']],
  [question,3000,['De USD 2.000 a USD 4.000']],
  ['Qual sua remuneração atual?',3000,['De R$ 2.000 a R$3.000']],
  [question,3000,['De R$ 2.000 a R$5.000','De R$ 2.500 a R$4.000']],
  [question,3000,['De R$ 2.00 a R$4.00']],
 ] as [string,number,string[]][])expect(salaryOption(q,value,options)).toBeUndefined();
});
