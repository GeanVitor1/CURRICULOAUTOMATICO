import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowUpRight,Check,CheckCircle2,Clock3,Link2,RefreshCw,ShieldCheck,Unplug,X} from 'lucide-react';
import {api,date,useApp} from '../lib';
import {Button,Modal} from '../components';
import type {SiteCapability} from '../CareerInterview';
import {browserConnectors,isBrowserSessionPortal,type BrowserSessionPortal} from '../../shared/browser-connectors';
import ConnectionBrand from '../ConnectionBrand';
import '../connections.css';

const order:BrowserSessionPortal[]=['linkedin','gupy','infojobs','glassdoor'];
const descriptions={linkedin:'Sua rede profissional e novas oportunidades.',gupy:'Suas oportunidades nos processos seletivos.',infojobs:'Seu perfil e suas vagas, mais perto de você.',glassdoor:'Sua conta para explorar o próximo passo.'};
const confirmed=(site?:SiteCapability)=>site?.sessionState==='local_verified'||!!site?.connected&&!['expired','suspended','unavailable','local_stale'].includes(site.sessionState||'');

export default function Connections(){
 const {toast,demo}=useApp(),client=useQueryClient();
 const sites=useQuery({queryKey:['automation-sites'],queryFn:()=>api<SiteCapability[]>('/automation/sites'),staleTime:15000,refetchOnWindowFocus:true});
 const [disconnect,setDisconnect]=useState<BrowserSessionPortal|null>(null),[busy,setBusy]=useState(false);
 const [returned,setReturned]=useState(()=>{const value=new URLSearchParams(location.search).get('connected');return value&&isBrowserSessionPortal(value)?value:null;});
 const data=sites.isError?[]:sites.data||[],count=order.filter(id=>confirmed(data.find(s=>s.id===id))).length;
 useEffect(()=>{if(new URLSearchParams(location.search).has('connected'))history.replaceState({},'',location.pathname+'#conexoes');},[]);
 const remove=async()=>{
  if(!disconnect||busy)return;setBusy(true);
  try{await api(`/connections/${disconnect}`,{method:'DELETE'});setDisconnect(null);await Promise.all([client.invalidateQueries({queryKey:['automation-sites']}),client.invalidateQueries({queryKey:['workspace']})]);toast('Conta desconectada do EmpreGatos.');}
  catch(error){toast((error as Error).message,true);}finally{setBusy(false);}
 };
 return <div className="connections-page">
  <header className="connections-heading"><div><span className="connections-eyebrow">SEU PRÓXIMO PASSO COMEÇA COM UMA CONEXÃO</span><h1>Conexões<span>.</span></h1><p>Seus sites de emprego, juntos no mesmo lugar.</p></div><button className="connections-refresh" disabled={sites.isFetching} onClick={()=>void sites.refetch()}><RefreshCw size={16} className={sites.isFetching?'is-spinning':''}/>Atualizar</button></header>
  <section className="connections-overview" aria-label="Resumo das conexões"><div className="connections-overview-icon"><Link2 size={27}/></div><div><h2>Suas contas. Mais possibilidades.</h2><p>Escolha um site, conecte pela extensão e acompanhe tudo por aqui.</p></div><div className="connections-total" aria-live="polite"><strong>{sites.isPending||sites.isError?'—':count}<span>/ 4</span></strong><span>{sites.isPending?'Verificando contas':sites.isError?'Status indisponível':'contas conectadas'}</span></div></section>
  {returned&&confirmed(data.find(s=>s.id===returned))&&<div className="connections-success" role="status"><CheckCircle2 size={20}/><div><strong>{browserConnectors[returned].name} conectado com sucesso</strong><span>Sua conexão já está disponível nesta página.</span></div><button aria-label="Fechar confirmação" onClick={()=>setReturned(null)}><X size={18}/></button></div>}
  {sites.isError&&<div className="connections-error" role="alert"><p>Não conseguimos conferir suas conexões. {sites.error.message}</p><button onClick={()=>void sites.refetch()}>Tentar novamente</button></div>}
  <section className="connections-grid" aria-label="Sites de emprego">
   {order.map(id=>{
    const provider=browserConnectors[id],site=data.find(s=>s.id===id),connected=confirmed(site),stale=site?.sessionState==='local_stale'||site?.sessionState==='expired';
    const label=sites.isPending?'Verificando…':sites.isError?'Status indisponível':connected?'Conectada':stale?'Verificar novamente':site?.sessionState==='suspended'?'Indisponível':'Não conectada';
    const available=!!site?.connectable&&!sites.isError&&!sites.isPending&&!demo;
    return <article className={`connections-provider${connected?' is-connected':''}`} key={id}>
     <div className="connections-card-top"><ConnectionBrand portal={id}/><span className={`connections-state${connected?' is-connected':stale?' is-stale':''}`}>{connected?<Check size={13}/>:<span/>}{label}</span></div>
     <h2>{provider.name}</h2><p className="connections-provider-description">{descriptions[id]}</p>
     <div className="connections-card-detail"><Clock3 size={15}/><span>{connected?(id==='linkedin'?'Login verificado neste Chrome':`Conectada em ${date(site?.connectedAt)}`):stale?'Confirme seu login para atualizar a conexão.':sites.isPending?'Conferindo o status da sua conta…':!available&&!sites.isError?'Conexão indisponível no momento.':'Conecte sua conta para começar.'}</span></div>
     {id==='linkedin'&&<p className="connections-local-note">Verificação local. O envio automático pelo LinkedIn é separado.</p>}
     <div className="connections-card-actions">{available?<a className={`connections-connect${connected?' is-secondary':''}`} href={`/app?portal=${id}&flow=connections`} aria-label={`${connected?'Reconectar':'Conectar'} ${provider.name}`}>{connected?'Reconectar':'Conectar conta'}<ArrowUpRight size={18}/></a>:<button className="connections-connect" disabled>{sites.isPending?'Verificando…':sites.isError?'Aguarde a verificação':'Indisponível'}</button>}{(connected||site?.sessionSaved||site?.sessionState==='local_stale')&&<button className="connections-disconnect" onClick={()=>setDisconnect(id)} aria-label={`Desconectar ${provider.name}`}><Unplug size={14}/>Desconectar</button>}</div>
    </article>;
   })}
  </section>
  <section className="connections-how" aria-labelledby="connections-how-title"><div className="connections-how-heading"><span className="connections-eyebrow">SIMPLES, DO INÍCIO AO FIM</span><h2 id="connections-how-title">Uma extensão. Três passos.</h2></div><ol><li><span>01</span><div><h3>Escolha o site</h3><p>Clique em conectar na conta que quer adicionar.</p></div></li><li><span>02</span><div><h3>Autorize na extensão</h3><p>Entre no portal e confirme a conexão no seu Chrome.</p></div></li><li><span>03</span><div><h3>Pronto, volte para cá</h3><p>A confirmação aparece aqui após a verificação.</p></div></li></ol></section>
  <div className="connections-privacy"><ShieldCheck size={21}/><p><strong>Você está no controle.</strong> Cada site é autorizado separadamente. Desconecte quando quiser.</p></div>
  {disconnect&&<Modal title={`Desconectar ${browserConnectors[disconnect].name}?`} open onOpenChange={open=>{if(!open&&!busy)setDisconnect(null);}} busy={busy}><p>A conexão será removida do EmpreGatos. Sua conta no site de emprego continua existindo.</p><div className="modal-actions"><Button disabled={busy} onClick={()=>setDisconnect(null)}>Cancelar</Button><Button className="danger" disabled={busy} onClick={()=>void remove()}>{busy?'Desconectando…':'Desconectar conta'}</Button></div></Modal>}
 </div>;
}
