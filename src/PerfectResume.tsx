import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowLeft,ArrowRight,Check,Download,FileText,Link2,LoaderCircle,Plus,Save,Sparkles,Trash2} from 'lucide-react';
import {api,useApp} from './lib';
import {Button,Field} from './components';
import IntelligenceControl from './IntelligenceControl';
import type {PerfectResume as Draft,PerfectResumeContent,PerfectResumeJob,PerfectResumeTemplate} from '../shared/perfect-resume';
import './perfect-resume.css';

const templates:[PerfectResumeTemplate,string,string][]=[['essencial','Essencial','Simples e direto'],['moderno','Moderno','Leve e contemporâneo'],['executivo','Executivo','Sóbrio e elegante']];
const copy=<T,>(value:T):T=>structuredClone(value);
export function PerfectResumePaper({draft,letter=false}:{draft:Draft;letter?:boolean}){
 const c=draft.content,english=draft.language==='en';
 const section=(title:string,body:React.ReactNode)=><section><h3>{title}</h3>{body}</section>;
 return <article className={`perfect-paper template-${draft.template}`} aria-label={letter?'Prévia da carta de apresentação':'Prévia do currículo'}>
  <header><h2>{draft.contact.name}</h2><p>{[draft.contact.email,draft.contact.phone,draft.contact.location].filter(Boolean).join(' · ')}</p>{draft.contact.links.length>0&&<p>{draft.contact.links.join(' · ')}</p>}</header>
  <h4>{letter?(english?'Cover letter':'Carta de apresentação'):c.headline}</h4>
  {letter?<p className="perfect-letter">{c.coverLetter}</p>:<>
   {section(english?'Professional summary':'Resumo profissional',<p>{c.summary}</p>)}
   {!!c.skills.length&&section(english?'Core skills':'Competências',<p>{c.skills.join(' · ')}</p>)}
   {!!c.experience.length&&section(english?'Professional experience':'Experiência profissional',c.experience.map((e,i)=><div className="perfect-paper-entry" key={i}><strong>{e.heading}</strong>{e.period&&<small>{e.period}</small>}<ul>{e.bullets.map((b,k)=><li key={k}>{b.text}</li>)}</ul></div>))}
   {!!c.education.length&&section(english?'Education':'Formação',c.education.map((e,i)=><p key={i}>{e}</p>))}
   {!!c.projects.length&&section(english?'Projects':'Projetos',c.projects.map((e,i)=><div key={i}><strong>{e.heading}</strong><ul>{e.bullets.map((b,k)=><li key={k}>{b.text}</li>)}</ul></div>))}
   {c.languages&&section(english?'Languages':'Idiomas',<p>{c.languages}</p>)}
  </>}
 </article>;
}

export default function PerfectResume(){
 const {w,navigate,toast}=useApp(),client=useQueryClient();
 const accountId=client.getQueryData<{id:string}>(['me'])?.id;
 const library=useQuery({queryKey:['perfect-resumes',accountId],queryFn:()=>api<{items:Draft[]}>('/perfect-resumes'),initialData:{items:w.perfectResumes||[]}});
 const [sourceId,setSourceId]=useState(w.resumes[0]?.id||''),[url,setUrl]=useState(()=>{const value=new URLSearchParams(location.search).get('vaga');return value&&/^https?:\/\//i.test(value)?value:'';});
 const [pasted,setPasted]=useState(''),[pasteOpen,setPasteOpen]=useState(false),[job,setJob]=useState<PerfectResumeJob|null>(null),[additional,setAdditional]=useState('');
 const [template,setTemplate]=useState<PerfectResumeTemplate>('moderno'),[language,setLanguage]=useState<'pt-BR'|'en'>('pt-BR');
 const [draft,setDraft]=useState<Draft|null>(null),[saved,setSaved]=useState<Draft|null>(null),[dirty,setDirty]=useState(false),[tab,setTab]=useState<'resume'|'letter'|'changes'>('resume');
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[consentBusy,setConsentBusy]=useState(false),locked=useRef(false),requestId=useRef(crypto.randomUUID());
 useEffect(()=>{if(!sourceId&&w.resumes[0])setSourceId(w.resumes[0].id);},[w.resumes,sourceId]);
 useEffect(()=>{if(!locked.current)requestId.current=crypto.randomUUID();},[sourceId,job,additional,template,language]);
 const source=w.resumes.find(r=>r.id===sourceId),aiReady=!!w.intelligence?.enabled&&w.intelligence.provider!=='local'&&(!!w.intelligence.consent||w.intelligence.provider==='ollama');
 const run=async(label:string,work:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(label);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir. Tente novamente.');}finally{locked.current=false;setBusy('');}};
 const refresh=()=>Promise.all([client.invalidateQueries({queryKey:['perfect-resumes']}),client.invalidateQueries({queryKey:['workspace']})]);
 const open=(value:Draft)=>{if(dirty){setError('Salve ou descarte as alterações antes de abrir outra versão.');return;}setDraft(copy(value));setSaved(copy(value));setTab('resume');setError('');};
 const update=<K extends keyof PerfectResumeContent,>(key:K,value:PerfectResumeContent[K])=>{setDraft(d=>d?{...d,content:{...d.content,[key]:value}}:d);setDirty(true);};
 const save=async()=>{
  if(!draft)throw Error('Escolha uma versão.');if(!dirty)return draft;
  const next=await api<Draft>(`/perfect-resumes/${draft.id}`,{method:'PUT',body:JSON.stringify({revision:draft.revision,content:draft.content,template:draft.template})});
  setDraft(copy(next));setSaved(copy(next));setDirty(false);await refresh();return next;
 };
 const download=(kind:'resume'|'letter',format:'pdf'|'txt'='pdf')=>void run('Preparando download',async()=>{
  const value=await save(),response=await fetch(`/api/perfect-resumes/${value.id}/download?kind=${kind}&format=${format}`);
  if(!response.ok){const detail=await response.json().catch(()=>null);throw Error(detail?.error||'Não foi possível preparar o download.');}
  const blob=await response.blob(),link=URL.createObjectURL(blob),a=document.createElement('a');a.href=link;a.download=`${kind==='letter'?'carta-apresentacao':'curriculo-perfeito'}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(link),1000);
 });
 return <div className="perfect-page">
  <header className="perfect-hero"><div><span className="perfect-eyebrow"><Sparkles size={14}/> SEU PRÓXIMO PASSO</span><h1>Currículo <em>Perfeito</em></h1><p>Sua experiência, apresentada para a oportunidade que você quer.</p></div><div className="perfect-hero-note"><FileText size={23}/><span>Feito com a sua história.<br/><strong>Pronto para o próximo capítulo.</strong></span></div></header>
  <div className="perfect-steps" aria-label="Etapas do Currículo Perfeito">{['Escolha seu currículo','Adicione a vaga','Dê seu toque final'].map((step,i)=><span className={(i===0&&source)||(i===1&&job)||(i===2&&draft)?'complete':''} key={step}><i>{((i===0&&source)||(i===1&&job)||(i===2&&draft))?<Check size={13}/>:i+1}</i>{step}</span>)}</div>
  {error&&<div className="perfect-error" role="alert">{error}</div>}
  {library.isError&&<div className="perfect-error" role="alert">Não foi possível carregar suas versões salvas. <Button onClick={()=>void library.refetch()}>Tentar novamente</Button></div>}
  {draft?<>
   <div className="perfect-result-bar"><div><span className="perfect-eyebrow">SUA NOVA VERSÃO</span><h2>{draft.job.title}</h2><p>{draft.job.company||'Oportunidade selecionada'} · {dirty?'Alterações não salvas':'Versão salva na sua conta'}</p></div><div className="perfect-actions"><Button disabled={!!busy} onClick={()=>{if(dirty){setError('Salve ou descarte as alterações antes de criar outra versão.');return;}setDraft(null);setSaved(null);requestId.current=crypto.randomUUID();}}><Plus size={15}/>Nova versão</Button><Button disabled={!!busy||!dirty} onClick={()=>void run('Salvando',async()=>{await save();toast('Versão salva.');})}><Save size={15}/>Salvar alterações</Button><Button className="primary" disabled={!!busy} onClick={()=>download(tab==='letter'?'letter':'resume')}><Download size={15}/>{busy==='Preparando download'?'Preparando…':'Baixar PDF'}</Button></div></div>
   <div className="perfect-tabs" role="tablist" aria-label="Documentos da versão">{([['resume','Currículo'],['letter','Carta de apresentação'],['changes','O que mudou']]as const).map(([id,label])=><button role="tab" aria-selected={tab===id} aria-controls={`perfect-panel-${id}`} id={`perfect-tab-${id}`} onClick={()=>setTab(id)} key={id}>{label}</button>)}</div>
   {tab==='changes'?<section className="perfect-panel perfect-changes" id="perfect-panel-changes" role="tabpanel" aria-labelledby="perfect-tab-changes"><h2>O que esta versão destaca</h2><ul>{draft.content.changes.map((item,i)=><li key={i}><Check size={16}/>{item}</li>)}</ul>{!!draft.content.reviewNotes.length&&<><h3>Para sua revisão</h3><ul>{draft.content.reviewNotes.map((item,i)=><li key={i}>{item}</li>)}</ul></>}<p>Origem: {draft.sourceResumeName}. Seu currículo original continua disponível.</p><Button disabled={!!busy} onClick={()=>download('resume','txt')}><Download size={15}/>Baixar texto do currículo</Button></section>:<div className="perfect-editor-layout" id={`perfect-panel-${tab}`} role="tabpanel" aria-labelledby={`perfect-tab-${tab}`}>
    <section className="perfect-panel perfect-editor"><div className="perfect-section-heading"><div><span className="perfect-eyebrow">DO SEU JEITO</span><h2>{tab==='letter'?'Edite sua carta':'Dê o toque final'}</h2></div><span className="badge">Editável</span></div>
     {tab==='letter'?<Field label="Carta de apresentação"><textarea aria-label="Carta de apresentação" rows={18} maxLength={4000} disabled={!!busy} value={draft.content.coverLetter} onChange={e=>update('coverLetter',e.target.value)}/></Field>:<>
      <Field label="Título profissional"><input aria-label="Título profissional" maxLength={140} disabled={!!busy} value={draft.content.headline} onChange={e=>update('headline',e.target.value)}/></Field>
      <Field label="Resumo profissional"><textarea aria-label="Resumo profissional" rows={6} maxLength={1400} disabled={!!busy} value={draft.content.summary} onChange={e=>update('summary',e.target.value)}/></Field>
      <Field label="Competências" help="Separe por vírgulas. Conhecimentos adicionais podem ser informados antes de gerar uma nova versão."><textarea aria-label="Competências desta versão" rows={3} disabled={!!busy} value={draft.content.skills.join(', ')} onChange={e=>update('skills',e.target.value.split(',').map(s=>s.trim()).filter(Boolean))}/></Field>
      {draft.content.experience.map((item,i)=><Field key={i} label={item.heading} help={item.period||'Experiência informada no currículo de origem'}><textarea aria-label={`Atividades de ${item.heading}`} rows={5} disabled={!!busy} value={item.bullets.map(b=>b.text).join('\n')} onChange={e=>{const items=copy(draft.content.experience);items[i].bullets=e.target.value.split('\n').filter(Boolean).map((text,k)=>({text,evidence:item.bullets[k]?.evidence||item.bullets[0].evidence}));update('experience',items);}}/></Field>)}
      {draft.content.projects.map((item,i)=><Field key={i} label={item.heading}><textarea aria-label={`Projeto ${item.heading}`} rows={4} disabled={!!busy} value={item.bullets.map(b=>b.text).join('\n')} onChange={e=>{const items=copy(draft.content.projects);items[i].bullets=e.target.value.split('\n').filter(Boolean).map((text,k)=>({text,evidence:item.bullets[k]?.evidence||item.bullets[0].evidence}));update('projects',items);}}/></Field>)}
      {!!draft.content.education.length&&<div className="perfect-fixed-facts"><h3>Formação</h3>{draft.content.education.map((item,i)=><p key={i}>{item}</p>)}<small>Dados preservados do currículo de origem.</small></div>}
     </>}
     <fieldset className="perfect-template-picker" disabled={!!busy}><legend>Escolha o visual</legend>{templates.map(([id,name,description])=><label key={id} className={draft.template===id?'selected':''}><input type="radio" name="result-template" checked={draft.template===id} onChange={()=>{setDraft({...draft,template:id});setDirty(true);}}/><span className={`perfect-template-mark ${id}`}/><strong>{name}</strong><small>{description}</small></label>)}</fieldset>
     {dirty&&<Button disabled={!!busy} onClick={()=>{if(saved){setDraft(copy(saved));setDirty(false);setError('');}}}><ArrowLeft size={14}/>Descartar alterações</Button>}
    </section>
    <aside className="perfect-preview"><div className="perfect-preview-top"><span>PRÉVIA DO DOCUMENTO</span><span>A4 · texto selecionável</span></div><PerfectResumePaper draft={draft} letter={tab==='letter'}/></aside>
   </div>}
  </>:<div className="perfect-setup-layout"><section className="perfect-panel perfect-setup"><span className="perfect-eyebrow">COMECE POR AQUI</span><h2>Qual oportunidade você quer?</h2><p className="perfect-muted">A IA organiza sua trajetória e destaca o que tem relação com o próximo trabalho.</p>
   {!w.resumes.length?<div className="perfect-empty"><FileText size={27}/><h3>Adicione seu currículo para começar</h3><p>Usaremos esse documento como ponto de partida.</p><Button className="primary" onClick={()=>navigate('curriculo')}>Adicionar meu currículo<ArrowRight size={15}/></Button></div>:<>
    <Field label="Currículo de origem"><select aria-label="Currículo de origem" disabled={!!busy} value={sourceId} onChange={e=>setSourceId(e.target.value)}>{w.resumes.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select></Field>
    <form onSubmit={e=>{e.preventDefault();void run('Lendo a vaga',async()=>{try{const next=await api<PerfectResumeJob>('/perfect-resumes/inspect',{method:'POST',body:JSON.stringify({url,description:pasted})});setJob(next);}catch(error){setPasteOpen(true);throw error;}});}}>
     <Field label="Link da vaga"><div className="perfect-url"><Link2 size={17}/><input aria-label="Link da vaga" type="url" required maxLength={2000} placeholder="https://empresa.com/carreiras/vaga" value={url} disabled={!!busy} onChange={e=>{setUrl(e.target.value);setJob(null);}}/></div></Field>
     <button type="button" className="perfect-text-button" disabled={!!busy} onClick={()=>setPasteOpen(!pasteOpen)}>{pasteOpen?'Ocultar descrição':'Prefiro colar a descrição da vaga'}</button>
     {pasteOpen&&<Field label="Descrição da vaga"><textarea aria-label="Descrição da vaga para leitura" rows={6} minLength={80} maxLength={18000} value={pasted} disabled={!!busy} onChange={e=>{setPasted(e.target.value);setJob(null);}} placeholder="Cole o anúncio completo. Ideal para páginas que exigem login."/></Field>}
     <Button disabled={!!busy||!url} className="perfect-read-button">{busy==='Lendo a vaga'?<LoaderCircle size={16} className="perfect-spin"/>:<Link2 size={16}/>} {busy==='Lendo a vaga'?'Lendo a vaga…':job?'Ler novamente':'Ler vaga'}</Button>
    </form>
    {job&&<div className="perfect-job-card"><span><Check size={14}/>Vaga adicionada</span><Field label="Cargo da vaga"><input aria-label="Cargo da vaga" maxLength={200} value={job.title} disabled={!!busy} onChange={e=>setJob({...job,title:e.target.value})}/></Field><Field label="Empresa"><input aria-label="Empresa da vaga" maxLength={180} value={job.company} disabled={!!busy} onChange={e=>setJob({...job,company:e.target.value})}/></Field><details><summary>Conferir descrição</summary><textarea aria-label="Descrição usada na geração" rows={8} maxLength={18000} value={job.description} disabled={!!busy} onChange={e=>setJob({...job,description:e.target.value,source:'pasted'})}/></details></div>}
    <Field label="Conhecimentos ou projetos que ainda não estão no currículo" help="Opcional. Conte o que você já sabe ou fez e quer incluir nesta versão."><textarea aria-label="Conhecimentos adicionais" rows={3} maxLength={3000} disabled={!!busy} placeholder="Ex.: desenvolvi um projeto pessoal com React e TypeScript…" value={additional} onChange={e=>setAdditional(e.target.value)}/></Field>
    <Field label="Idioma do documento"><select aria-label="Idioma do documento" value={language} disabled={!!busy} onChange={e=>setLanguage(e.target.value as 'pt-BR'|'en')}><option value="pt-BR">Português do Brasil</option><option value="en">English</option></select></Field>
    <fieldset className="perfect-template-picker" disabled={!!busy}><legend>Escolha o visual</legend>{templates.map(([id,name,description])=><label key={id} className={template===id?'selected':''}><input type="radio" name="setup-template" checked={template===id} onChange={()=>setTemplate(id)}/><span className={`perfect-template-mark ${id}`}/><strong>{name}</strong><small>{description}</small></label>)}</fieldset>
    {!aiReady&&<><IntelligenceControl disabled={!!busy} onBusyChange={setConsentBusy}/><p className="perfect-muted">Ative a análise por IA para gerar seu documento. Você pode gerenciar a conexão em Minha conta.</p><Button onClick={()=>navigate('conta')}>Configurações de IA</Button></>}
    <Button className="primary perfect-generate" disabled={!!busy||!job||!source||!aiReady||consentBusy} onClick={()=>void run('Criando seu currículo',async()=>{if(!job)return;const next=await api<Draft>('/perfect-resumes',{method:'POST',body:JSON.stringify({requestId:requestId.current,sourceResumeId:sourceId,job,template,language,additionalContext:additional})});setDraft(copy(next));setSaved(copy(next));setDirty(false);setTab('resume');requestId.current=crypto.randomUUID();await refresh();toast('Seu Currículo Perfeito está pronto para revisão.');})}>{busy==='Criando seu currículo'?<LoaderCircle size={18} className="perfect-spin"/>:<Sparkles size={18}/>} {busy==='Criando seu currículo'?'Criando seu currículo…':'Criar Currículo Perfeito'}{!busy&&<ArrowRight size={17}/>}</Button>
    {busy==='Criando seu currículo'&&<p role="status" className="perfect-muted">A IA está organizando sua experiência e preparando os documentos. Aguarde nesta página.</p>}
    <p className="perfect-footnote">A versão é salva separadamente. Revise antes de usar em uma candidatura.</p>
   </>}
  </section><aside className="perfect-intro-preview"><div className="perfect-intro-paper"><span className="perfect-eyebrow">ESPAÇO PARA O SEU FUTURO</span><div className="perfect-mini-header"><FileText size={28}/><div><h3>{w.profile.name||'Seu nome'}</h3><p>Uma apresentação profissional, do seu jeito.</p></div></div><div className="perfect-skeleton" aria-hidden="true"><i/><i/><i/><b/><i/><i/><i/><b/><i/><i/></div><div className="perfect-preview-seal"><Sparkles size={17}/><span>Clareza, foco e personalidade.</span></div></div><div className="perfect-benefits"><p><Check size={16}/>Resumo e experiências com foco profissional</p><p><Check size={16}/>Currículo e carta com o mesmo visual</p><p><Check size={16}/>Editor, versões salvas e PDF para baixar</p></div>{source&&<details className="perfect-source-details"><summary>Conferir currículo original</summary><pre>{source.text}</pre></details>}</aside></div>}
  {!!library.data.items.length&&<section className="perfect-library"><div className="perfect-section-heading"><div><span className="perfect-eyebrow">SEUS DOCUMENTOS</span><h2>Versões que acompanham seus próximos passos</h2></div><span>{library.data.items.length} / 12</span></div><div className="perfect-library-grid">{library.data.items.map(item=><article key={item.id}><div className={`perfect-library-icon ${item.template}`}><FileText size={23}/></div><div><h3>{item.content.headline}</h3><p>{item.job.company||item.job.title}</p><small>{new Date(item.updatedAt).toLocaleDateString('pt-BR')} · {item.language==='en'?'English':'Português'}</small></div><div className="perfect-library-actions"><Button disabled={!!busy} onClick={()=>open(item)}>Abrir versão<ArrowRight size={14}/></Button><button aria-label={`Excluir versão ${item.content.headline}`} disabled={!!busy||dirty} onClick={()=>void run('Excluindo versão',async()=>{await api(`/perfect-resumes/${item.id}`,{method:'DELETE'});if(draft?.id===item.id){setDraft(null);setSaved(null);setDirty(false);}await refresh();})}><Trash2 size={16}/></button></div></article>)}</div></section>}
 </div>;
}
