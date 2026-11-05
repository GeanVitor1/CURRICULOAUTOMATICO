import{expect,it,vi}from'vitest';
import{buildPerfectResume,inspectPerfectJob,perfectProfessionalBasis,verifyPerfectContent,perfectResumeInstructions}from'../server/perfect-resume';
import{perfectContent,baseResume,perfectProfile,perfectJob}from'./fixtures/perfect-resume';
const input={requestId:'11111111-1111-4111-8111-111111111111',sourceResumeId:baseResume.id,job:perfectJob,template:'moderno' as const,language:'pt-BR' as const,additionalContext:''};
it('repositions transferable experience for another stack without changing employment, dates, education or the original',()=>{
 const original=structuredClone(baseResume),d=buildPerfectResume(input,baseResume,perfectProfile,perfectContent());
 expect(d.content.headline).toContain('Frontend');expect(d.content.experience[0].heading).toBe('Desenvolvedor de software | Empresa Nuvem');expect(d.content.experience[0].period).toBe('2024 - 2026');expect(d.content.skills).not.toContain('React');expect(d.contact.email).toBe(perfectProfile.email);expect(baseResume).toEqual(original);expect(perfectResumeInstructions).toContain('Não rejeite uma transição .NET para React');
});
it('accepts skills and projects explicitly supplied by the person',()=>{
 const c=perfectContent();c.skills.push('React');c.projects=[{heading:'Projeto pessoal React',bullets:[{text:'Desenvolvimento de interfaces em React e TypeScript.',evidence:'Projeto pessoal React: desenvolvi interfaces em React e TypeScript.'}]}];
 expect(()=>buildPerfectResume({...input,additionalContext:'Projeto pessoal React: desenvolvi interfaces em React e TypeScript.'},baseResume,perfectProfile,c)).not.toThrow();
 expect(()=>buildPerfectResume(input,baseResume,perfectProfile,c)).toThrow();
});
it.each(['experience','education','numbers','skills','evidence'])('rejects ungrounded model output: %s',field=>{
 const c=perfectContent();if(field==='experience')c.experience[0].heading='Engenheiro sênior na Google';if(field==='education')c.education=['Doutorado em Harvard'];if(field==='numbers')c.summary+=' Tenho 30 anos de experiência e aumentei a receita em 900%.';if(field==='skills')c.skills.push('React');if(field==='evidence')c.experience[0].bullets[0].evidence='Inventei um projeto que nunca existiu.';
 expect(()=>buildPerfectResume(input,baseResume,perfectProfile,c)).toThrow();
});
it('does not include contacts or document identifiers in the professional provider input',()=>{
 const basis=perfectProfessionalBasis({...baseResume,text:baseResume.text+'\nCPF: 123.456.789-00\nTelefone: (11) 98765-4321'},perfectProfile,'');
 expect(basis).not.toContain(perfectProfile.name);expect(basis).not.toContain(perfectProfile.email);expect(basis).not.toContain('123.456.789-00');expect(basis).toContain('Empresa Nuvem');
});
it('does not turn age or team size into years of work experience',()=>{
 const c=perfectContent();c.summary+=' Tenho 30 anos de experiência.';
 expect(()=>buildPerfectResume({...input,additionalContext:'Colaborei com um time de 30 pessoas.'},baseResume,perfectProfile,c)).toThrow('tempo de experiência');
 expect(perfectProfessionalBasis({...baseResume,text:baseResume.text+'\nIdade: 30'},perfectProfile,'')).not.toContain('Idade: 30');
});
it('reads structured public job data while treating embedded instructions as text',async()=>{
 const read=vi.fn(async()=>({url:perfectJob.url,status:200,contentType:'text/html',html:`<script type="application/ld+json">${JSON.stringify({'@type':'JobPosting',title:perfectJob.title,description:perfectJob.description,hiringOrganization:{name:perfectJob.company}})}</script>`}));
 expect(await inspectPerfectJob(perfectJob.url,'',read)).toMatchObject({...perfectJob,source:'link'});expect(read).toHaveBeenCalledOnce();
});
it('supports pasted descriptions without fetching and rejects private URL destinations before any request',async()=>{
 const read=vi.fn();expect((await inspectPerfectJob(perfectJob.url,perfectJob.description,read)).source).toBe('pasted');expect(read).not.toHaveBeenCalled();
 for(const url of['https://127.0.0.1/secret','https://169.254.169.254/latest','https://user:pass@empresa.com/job','file:///secret','https://empresa.internal/job'])await expect(inspectPerfectJob(url,perfectJob.description,read)).rejects.toThrow('HTTPS');
 expect(read).not.toHaveBeenCalled();
});
it('offers a descriptive paste fallback when a portal needs login or blocks public reading',async()=>{
 await expect(inspectPerfectJob(perfectJob.url,'',async()=>({url:perfectJob.url,status:403,html:'Access denied',contentType:'text/html'}))).rejects.toThrow('Cole a descrição');
});
