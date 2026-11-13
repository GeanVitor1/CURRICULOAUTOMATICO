import { withBase } from './basePath';
import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowLeft,ArrowUpRight,Check,Link2,LoaderCircle,Puzzle,ShieldCheck} from 'lucide-react';
import {api} from './lib';
import {browserConnectors,type BrowserSessionPortal} from '../shared/browser-connectors';
import type {BrowserConnectionAccess} from '../shared/session-transfer-policy';
import ConnectionBrand from './ConnectionBrand';
import ChromeExtensionInstallation from './ChromeExtensionInstallation';
import type {Workspace} from '../shared/types';
import './RemotePortalLogin.css';
import './connections.css';

/** Resume that the server accepts to authorize automatic sends for this portal, if the workspace is ready. */
export function automationResumeId(w:Workspace|undefined,portal:BrowserSessionPortal){
 if(!w||portal==='linkedin'||!w.profile?.confirmed||!w.interview?.completed||!w.interview.answers.sites.includes(portal))return null;
 const id=w.interview.answers.resumeId;
 return id&&w.resumes.some(r=>r.id===id&&r.approved)?id:null;
}

export default function PortalConnectionFlow({portal,workspace}:{portal:BrowserSessionPortal;workspace?:Workspace}){
 const authorizeResume=useRef<string|null>(null);authorizeResume.current=automationResumeId(workspace,portal);
 const provider=browserConnectors[portal],saving=useRef(false),opened=useRef(false),mounted=useRef(true);
 const [extension,setExtension]=useState<{version:string;kind:string;text:string}|null>(null),[savePending,setSavePending]=useState(false),[error,setError]=useState(''),[detected,setDetected]=useState(false);
 const access=useQuery({queryKey:['connection-flow-context',portal],queryFn:()=>api<BrowserConnectionAccess>(`/connections/browser-extension-context?portal=${portal}`,{cache:'no-store'}),staleTime:0});
 const finish=()=>location.replace(withBase(`/app?connected=${portal}#conexoes`));
 const open=()=>window.postMessage({type:'empregatos:request-open-connector',portal},location.origin);
 useEffect(()=>{
  mounted.current=true;
  const timer=setTimeout(()=>setDetected(true),1800);
  const receive=async(event:MessageEvent)=>{
   if(event.source!==window||event.origin!==location.origin)return;
   const message=event.data;
   if(message?.type==='empregatos:connector-status'&&message.portal===portal&&typeof message.version==='string'&&/^\d+(\.\d+){1,3}$/.test(message.version)&&typeof message.text==='string'){
    setDetected(true);setExtension({version:message.version,kind:message.kind,text:message.text.slice(0,800)});return;
   }
   const local=message?.type==='empregatos:local-login-verified'&&message.portal===portal&&portal==='linkedin';
   const imported=portal!=='linkedin'&&((message?.type==='empregatos:browser-session'&&message.portal===portal)||(portal==='gupy'&&message?.type==='empregatos:gupy-browser-session'));
   if(!local&&!imported||saving.current)return;
   if(imported&&(message.frame?.authenticated!==true||typeof message.frame.viewerId!=='string'||!(/^[a-f0-9-]{36}$/i.test(message.frame.viewerId))))return;
   saving.current=true;setSavePending(true);setError('');
   try{
    if(local){
     const current=await api<BrowserConnectionAccess>(`/connections/browser-extension-context?portal=${portal}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
     if(current.available!==true||current.mode!=='local-browser'||!current.localLogin||!Number.isFinite(current.localLogin.expiresAt)||current.localLogin.expiresAt<=Date.now()||!Number.isFinite(Date.parse(current.localLogin.observedAt)))throw Error('O servidor ainda não confirmou uma verificação válida do LinkedIn.');
    }else{
     const resumeId=authorizeResume.current;
     const result=await api<{ok:boolean;automatic:boolean}>(`/connections/${portal}/confirm`,{method:'POST',headers:{'X-Portal-Viewer':message.frame.viewerId},body:JSON.stringify(resumeId?{authorizeAutomation:true,profileResumeId:resumeId}:{connectionOnly:true,authorizeAutomation:false,profileResumeId:null}),signal:AbortSignal.timeout(55000)});
     if(result.ok!==true||(!resumeId&&result.automatic!==false))throw Error('Não foi possível confirmar que a conexão foi salva. Confira o resultado em Conexões.');
    }
    if(mounted.current)finish();
   }catch(failure){if(mounted.current){setError((failure as Error).message);setSavePending(false);}}
  };
  window.addEventListener('message',receive);window.postMessage({type:'empregatos:request-connector-status',portal},location.origin);
  return()=>{mounted.current=false;clearTimeout(timer);window.removeEventListener('message',receive);};
 },[portal]);
 useEffect(()=>{if(extension&&access.data?.available&&!opened.current){opened.current=true;open();}},[extension,access.data?.available]);
 const working=savePending||extension?.kind==='connecting',problem=error||(!access.isPending&&(access.error?.message||(!access.data?.available?access.data?.unavailableReason||'Esta conexão não está disponível no momento.':'')))||(extension?.kind==='error'?extension.text:'');
 return <main className="connection-flow"><div className="connection-flow-shell"><a className="connection-flow-back" href="/app#conexoes"><ArrowLeft size={17}/>Voltar às conexões</a><div className="connection-flow-heading"><div className="connection-flow-brands"><ConnectionBrand portal={portal}/><Link2 size={22}/><span className="connection-flow-app">e<span>.</span></span></div><span className="connections-eyebrow">UMA CONEXÃO, MAIS OPORTUNIDADES</span><h1>Conecte sua conta<br/>do {provider.name}<span>.</span></h1><p>Autorize a conexão na aba da extensão. Ao concluir, você volta para o EmpreGatos com o resultado confirmado.</p></div>
  <section className="connection-flow-status" aria-live="polite" aria-busy={working}>{working?<LoaderCircle size={25} className="is-spinning"/>:extension?<Check size={25}/>:<Puzzle size={25}/>}<div><h2>{savePending?'Salvando sua conexão…':extension?.kind==='connecting'?'Verificando seu login…':extension?'Continue na aba da extensão':access.isPending||!detected?'Preparando sua conexão…':'Vamos abrir a extensão'}</h2><p>{savePending?'Aguarde a confirmação do servidor. Você será redirecionado automaticamente.':extension?.kind==='connecting'?extension.text:extension?'Escolha “Abrir login do portal”, entre na sua conta e confirme a autorização.':'Use a extensão EmpreGatos no Chrome para conectar esta conta.'}</p></div></section>
  {problem&&<div className="connections-error" role="alert"><p>{problem}</p><a href="/app#conexoes">Conferir minhas conexões</a>{access.isError&&<button onClick={()=>void access.refetch()}>Tentar novamente</button>}</div>}
  {!savePending&&!working&&extension&&access.data?.available&&<button className="connection-flow-open" onClick={open}><Puzzle size={18}/>Abrir aba da extensão<ArrowUpRight size={18}/></button>}
  {!extension&&detected&&access.data?.available&&<ChromeExtensionInstallation onOpenConnector={open} onCheckInstallation={()=>window.postMessage({type:'empregatos:request-connector-status',portal},location.origin)}/>}
  <p className="connection-flow-privacy"><ShieldCheck size={18}/>{portal==='linkedin'?'O LinkedIn é verificado neste Chrome. Esta conexão não ativa envios automáticos.':(automationResumeId(workspace,portal)?'Ao concluir, os envios automáticos por este site ficam liberados com o currículo aprovado nas suas preferências.':'Você autoriza apenas esta conexão. Sua rotina de candidaturas continua sob seu controle.')}</p>
 </div></main>;
}
