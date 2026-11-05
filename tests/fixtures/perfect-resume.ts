import{defaultProfile,type Resume}from'../../shared/types';
import type{PerfectResumeContent}from'../../shared/perfect-resume';
export const professionalSource=`Pessoa Exemplo
pessoa@example.com
Objetivo: Desenvolvedor de software
Resumo profissional
Desenvolvimento de aplicações web, interfaces e integração de APIs.
Experiência profissional
Desenvolvedor de software | Empresa Nuvem
2024 - 2026
Desenvolvi APIs REST em C# e .NET, interfaces com Angular e TypeScript e consultas SQL Server.
Trabalhei com testes automatizados, Git, revisão de código e integração entre frontend e backend.
Formação
Tecnologia em Análise e Desenvolvimento de Sistemas | Faculdade Exemplo | 2024
Competências
C#, .NET, Angular, TypeScript, SQL Server, Git, APIs REST
Idiomas
Português nativo; inglês intermediário`;
export const perfectProfile={...defaultProfile,name:'Pessoa Exemplo',email:'pessoa@example.com',phone:'11987654321',location:'Salvador, BA',headline:'Desenvolvedor .NET',skills:['C#','.NET','Angular','TypeScript','SQL Server','Git','APIs REST'],experience:'',education:'',languages:'Português nativo; inglês intermediário',years:2,confirmed:true};
export const baseResume:Resume={id:'source-resume',name:'curriculo-original.pdf',text:professionalSource,skills:perfectProfile.skills,approved:true,analysis:'',uploadedAt:'2026-10-01T12:00:00Z'};
export const perfectJob={url:'https://empresa.com/carreiras/frontend',title:'Desenvolvedor React',company:'Empresa Produto',description:'Buscamos uma pessoa para desenvolvimento de interfaces React e TypeScript, integração com APIs REST e testes automatizados. Conhecimentos de Git e boas práticas de desenvolvimento são importantes.',source:'pasted' as const};
export function perfectContent():PerfectResumeContent{return{headline:'Desenvolvedor de software | Frontend',summary:'Desenvolvedor de aplicações web com atuação em interfaces TypeScript, integração com APIs REST e colaboração na revisão de código. Experiência conectando frontend e backend com foco em clareza e manutenção.',skills:['TypeScript','APIs REST','Angular','Git','C#','.NET','SQL Server'],experience:[{heading:'Desenvolvedor de software | Empresa Nuvem',period:'2024 - 2026',bullets:[{text:'Desenvolvimento de interfaces com Angular e TypeScript e integração com APIs REST.',evidence:'Desenvolvi APIs REST em C# e .NET, interfaces com Angular e TypeScript e consultas SQL Server.'},{text:'Colaboração na revisão de código e integração entre frontend e backend.',evidence:'Trabalhei com testes automatizados, Git, revisão de código e integração entre frontend e backend.'}]}],education:['Tecnologia em Análise e Desenvolvimento de Sistemas | Faculdade Exemplo | 2024'],projects:[],languages:'Português nativo; inglês intermediário',coverLetter:'Olá, equipe de seleção. Tenho interesse na oportunidade de desenvolvimento frontend. Minha trajetória inclui interfaces TypeScript, integração com APIs REST e colaboração na revisão de código. Gostaria de conversar sobre como essa experiência pode contribuir com o time.',changes:['Resumo voltado ao desenvolvimento de interfaces e integração.','Competências reorganizadas para destacar fundamentos transferíveis.'],reviewNotes:['Acrescente seus projetos com React, caso já tenha desenvolvido algum.']};}
