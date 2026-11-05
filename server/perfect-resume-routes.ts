import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {mutateWorkspace,readWorkspace} from './db';
import {generatePrivateDocument} from './intelligence';
import {RequestError} from './errors';
import {perfectGenerateSchema,perfectContentSchema,perfectResumeInstructions,perfectProfessionalBasis,perfectSourceFingerprint,buildPerfectResume,inspectPerfectJob,verifyPerfectContent,perfectPublicUrl} from './perfect-resume';
import {createPerfectResumePdf,perfectResumeText} from './perfect-resume-pdf';
type Context={id:string;demo:boolean;u:{id:string}};
export function registerPerfectResumeRoutes(app:FastifyInstance,scope:(req:FastifyRequest)=>Promise<Context>,processing:()=>((req:FastifyRequest)=>Promise<void>)){
 app.post('/api/perfect-resumes/inspect',{preHandler:processing(),config:{rateLimit:{max:8,timeWindow:'1 minute'}}},async req=>{
  await scope(req);const body=z.object({url:z.url().max(2000),description:z.string().max(18000).default('')}).strict().parse(req.body);
  return inspectPerfectJob(body.url,body.description);
 });
 app.get('/api/perfect-resumes',async req=>{const{id}=await scope(req);return{items:(await readWorkspace(id))!.perfectResumes||[]};});
 app.post('/api/perfect-resumes',{preHandler:processing(),config:{rateLimit:{max:3,timeWindow:'1 minute'}}},async req=>{
  const{id,u}=await scope(req),input=perfectGenerateSchema.parse(req.body);perfectPublicUrl(input.job.url);
  const snapshot=(await readWorkspace(id))!,existing=snapshot.perfectResumes?.find(d=>d.requestId===input.requestId);
  if(existing)return existing;
  if((snapshot.perfectResumes?.length||0)>=12)throw new RequestError('Você já tem 12 versões. Exclua uma versão antiga para criar outra.');
  const resume=snapshot.resumes.find(r=>r.id===input.sourceResumeId);
  if(!resume?.text.trim())throw new RequestError('Escolha um currículo salvo na sua conta.');
  const basis=perfectProfessionalBasis(resume,snapshot.profile,input.additionalContext);
  const prompt=JSON.stringify({language:input.language==='en'?'English':'Português do Brasil',professionalSource:basis,job:{title:input.job.title,company:input.job.company,description:input.job.description}});
  const raw=await generatePrivateDocument(u.id,prompt,perfectResumeInstructions,perfectContentSchema),draft=buildPerfectResume(input,resume,snapshot.profile,raw);
  return mutateWorkspace(id,w=>{
   const duplicate=w.perfectResumes?.find(d=>d.requestId===input.requestId);if(duplicate)return duplicate;
   const current=w.resumes.find(r=>r.id===resume.id);if(!current||perfectSourceFingerprint(current,w.profile)!==draft.sourceFingerprint)throw new RequestError('Seu currículo ou perfil mudou durante a geração. Gere novamente para usar os dados atuais.');
   if((w.perfectResumes?.length||0)>=12)throw new RequestError('Limite de 12 versões atingido.');
   w.perfectResumes||=[];w.perfectResumes.unshift(draft);return draft;
  });
 });
 app.put('/api/perfect-resumes/:draftId',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async req=>{
  const{id}=await scope(req),draftId=z.uuid().parse((req.params as any).draftId),body=z.object({revision:z.number().int().positive(),content:perfectContentSchema,template:z.enum(['essencial','moderno','executivo'])}).strict().parse(req.body);
  return mutateWorkspace(id,w=>{
   const draft=w.perfectResumes?.find(d=>d.id===draftId);if(!draft)throw new RequestError('Versão não encontrada nesta conta.');
   if(draft.revision!==body.revision)throw new RequestError('Esta versão mudou em outra aba. Abra a versão salva antes de editar.');
   const resume=w.resumes.find(r=>r.id===draft.sourceResumeId);if(!resume)throw new RequestError('O currículo de origem foi removido.');
   draft.content=verifyPerfectContent(body.content,perfectProfessionalBasis(resume,w.profile,draft.additionalContext),w.profile.years);draft.template=body.template;draft.updatedAt=new Date().toISOString();draft.revision++;return draft;
  });
 });
 app.delete('/api/perfect-resumes/:draftId',async req=>{const{id}=await scope(req),draftId=z.uuid().parse((req.params as any).draftId);await mutateWorkspace(id,w=>{w.perfectResumes=(w.perfectResumes||[]).filter(d=>d.id!==draftId);});return{ok:true};});
 app.get('/api/perfect-resumes/:draftId/download',async(req,reply)=>{
  const{id}=await scope(req),draftId=z.uuid().parse((req.params as any).draftId),query=z.object({kind:z.enum(['resume','letter']).default('resume'),format:z.enum(['pdf','txt']).default('pdf')}).parse(req.query);
  const draft=(await readWorkspace(id))!.perfectResumes?.find(d=>d.id===draftId);if(!draft)throw new RequestError('Versão não encontrada nesta conta.');
  const letter=query.kind==='letter';if(letter&&!draft.content.coverLetter)throw new RequestError('Esta versão não contém carta de apresentação.');
  const bytes=query.format==='txt'?Buffer.from(perfectResumeText(draft,letter)):await createPerfectResumePdf(draft,letter);
  return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename="${letter?'carta-apresentacao':'curriculo-perfeito'}-${draftId}.${query.format}"`).type(query.format==='pdf'?'application/pdf':'text/plain; charset=utf-8').send(bytes);
 });
}
