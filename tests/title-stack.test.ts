import {describe,expect,it} from 'vitest';
import {titleStackCompatible} from '../server/engine';
const dotnet={skills:['C#','.NET','ASP.NET Core','Angular','TypeScript','JavaScript','SQL Server','Git','APIs REST'],experience:'Analista de Sistemas full stack com C#, .NET 8, Angular e JavaScript.',headline:'Analista de Sistemas e Desenvolvedor Full Stack'};
describe('titleStackCompatible',()=>{
 it('rejects a Java role for a .NET candidate who only knows JavaScript',()=>{expect(titleStackCompatible('Analista de Sistemas Java - (Sustentação)',dotnet)).toBe(false);});
 it('accepts .NET, C# and generic roles',()=>{
  expect(titleStackCompatible('Desenvolvedor .NET Pleno',dotnet)).toBe(true);
  expect(titleStackCompatible('Desenvolvedor C# / Angular',dotnet)).toBe(true);
  expect(titleStackCompatible('Analista de Sistemas',dotnet)).toBe(true);
  expect(titleStackCompatible('Desenvolvedor JavaScript',dotnet)).toBe(true);
 });
 it('rejects other named stacks the candidate lacks',()=>{
  expect(titleStackCompatible('Desenvolvedor Python',dotnet)).toBe(false);
  expect(titleStackCompatible('Analista PHP/Laravel',dotnet)).toBe(false);
 });
 it('accepts Java for a Java candidate',()=>{expect(titleStackCompatible('Analista de Sistemas Java',{skills:['Java','Spring'],experience:'',headline:''})).toBe(true);});
});
