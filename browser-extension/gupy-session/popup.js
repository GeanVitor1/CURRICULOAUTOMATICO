/* global chrome, EmpreGatosPortals */
const {browserConnectors,sessionDomain,isBrowserSessionPortal,browserConnectionMode}=EmpreGatosPortals;
const base='https://curriculoautomatico.vercel.app';
const select=document.querySelector('#portal'),connect=document.querySelector('#connect');
const status=document.querySelector('#status'),account=document.querySelector('#account');
const title=document.querySelector('#title'),consentLabel=document.querySelector('#consent-label');
const steps=['step-login','step-detect','step-done'].map(id=>document.querySelector('#'+id));
// 0 = aguardando clique, 1 = aguardando login, 2 = conectando, 3 = concluído.
const showStep=n=>steps.forEach((el,i)=>{if(!el)return;el.className=i<n-1||n===3?'done':i===n-1?'active':'';});
const LOGIN_WAIT_MS=10*60000,LOGIN_POLL_MS=2000;
document.querySelector('#version').textContent=`EmpreGatos ${chrome.runtime?.getManifest?.()?.version||''}`;
let context=null,busy=false,loadSequence=0;
const update=()=>{connect.disabled=busy||!context?.available||context.portal!==select.value;status.setAttribute?.('aria-busy',String(busy));connect.textContent=busy?'Conectando…':browserConnectionMode(select.value)==='local-browser'?'Verificar LinkedIn':'Conectar conta';};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const missingTab=error=>/no tab with id|invalid tab id|tab was closed/i.test(String(error?.message||error));
const projectUrl=(tab,portal)=>{
 try{const url=new URL(tab.url||tab.pendingUrl);return url.origin===base&&url.pathname==='/app'&&url.searchParams.get('portal')===portal;}catch{return false;}
};
async function appTab(portal){
 const source=new URL(location.href||'https://invalid.test'),hint=source.searchParams.get('tab');
 if(source.searchParams.get('portal')===portal&&hint&&/^\d+$/.test(hint)&&Number.isSafeInteger(Number(hint))){
  try{const tab=await chrome.tabs.get(Number(hint));if(projectUrl(tab,portal))return tab;}
  catch(error){if(!missingTab(error))throw error;}
 }
 const tabs=await chrome.tabs.query({url:base+'/app*'});
 const matching=tabs.filter(tab=>projectUrl(tab,portal));
 const existing=matching.find(tab=>new URL(tab.url||tab.pendingUrl).searchParams.get('flow')==='connections')||matching[0];
 return existing||await chrome.tabs.create({url:base+'/app?portal='+encodeURIComponent(portal),active:false});
}
async function message(tabId,data){
 let repaired=false;
 for(let attempt=0;attempt<20;attempt++){
  try{const result=await chrome.tabs.sendMessage(tabId,data);if(!result)throw new Error('Bridge unavailable');return result;}catch(error){
   // A missing tab is a definitive pre-delivery error, unlike a closed message
   // port: let the caller find a new destination and revalidate its owner.
   if(missingTab(error))throw error;
   if(['empregatos:import-session','empregatos:verify-local-login'].includes(data.type)&&!/receiving end does not exist|could not establish connection|bridge unavailable/i.test(String(error.message||error)))throw new Error('A verificação foi interrompida. Confira a aba do EmpreGatos antes de repetir a conexão.');
   if(!repaired){
    const tab=await chrome.tabs.get(tabId),url=new URL(tab.url||tab.pendingUrl);
    if(url.origin!==base||url.pathname!=='/app')throw new Error('A aba do EmpreGatos mudou de endereço. Abra a conexão novamente.');
    await chrome.scripting.executeScript({target:{tabId},files:['config.js','content.js']});repaired=true;
   }
   if(attempt===19)throw new Error('Não foi possível falar com a aba do EmpreGatos. Reabra a conexão.');await pause(400);
  }
 }
}
async function destinationContext(portal){
 for(let attempt=0;attempt<2;attempt++){
  try{
   const tab=await appTab(portal),result=await message(tab.id,{type:'empregatos:connection-context',portal});
   if(!result?.ok)throw new Error(result?.error||'Entre na sua conta do EmpreGatos antes de conectar.');
   const value=result.context;
   if(value?.portal!==portal||typeof value.available!=='boolean'||!value.account||!['id','name','email'].every(key=>typeof value.account[key]==='string'&&value.account[key].trim()))throw new Error('Não foi possível confirmar a conta de destino. Entre no EmpreGatos e clique em “Atualizar conta”.');
   return {...result.context,tabId:tab.id};
  }catch(error){if(!missingTab(error))throw error;if(attempt===1)throw new Error('A aba do EmpreGatos foi fechada. Mantenha a conexão do projeto aberta e tente novamente.');}
 }
}
async function validateDestination(portal,expected){
 const fresh=await destinationContext(portal);
 if(fresh.portal!==portal||!fresh.available)throw new Error('Não foi possível confirmar a conta de destino. Reabra o conector e tente novamente.');
 if(fresh.account.id!==expected.account.id){
  context=fresh;account.textContent=`Novo destino no EmpreGatos: ${fresh.account.name} (${fresh.account.email}).`;
  throw new Error('A conta do EmpreGatos mudou. Confira o novo destino e autorize novamente.');
 }
 return fresh;
}
async function feedback(destination,portal,text,kind='connecting'){
 status.textContent=text;
 // Progress is best effort; never delay the actual operation repairing a notice.
 try{await chrome.tabs.sendMessage(destination.tabId,{type:'empregatos:connector-progress',portal,text,kind,version:chrome.runtime?.getManifest?.()?.version||''});}catch{}
}
async function loadContext(){
 if(busy)return;
 const portal=select.value,sequence=++loadSequence;
 if(!isBrowserSessionPortal(portal))return;
 context=null;update();showStep(0);
 const local=browserConnectionMode(portal)==='local-browser',name=browserConnectors[portal].name;
 if(title)title.textContent=`Conectar ${name}`;
 if(consentLabel)consentLabel.textContent=local?'Ao clicar, você autoriza verificar seu login do LinkedIn neste Chrome. Cookies e tokens não saem do navegador.':`Ao clicar, você autoriza transferir somente sua sessão do ${name} para a conta do EmpreGatos acima. Não lemos senhas nem a sessão do Google.`;
 account.textContent='Verificando sua conta no EmpreGatos…';status.textContent='';
 try{
  const fresh=await destinationContext(portal);
  if(sequence!==loadSequence)return;
  context=fresh;
  account.textContent=`Conta do EmpreGatos: ${context.account.name} · ${context.account.email}`;
  if(!context.available)status.textContent=context.unavailableReason||'Este conector ainda não foi habilitado no servidor para sua conta.';
  else{
   const saved=await chrome.storage.local.get('pendingLoginPortal');
   if(sequence!==loadSequence)return;
   if(context.notice)status.textContent=context.notice;
   else if(saved.pendingLoginPortal===portal)status.textContent=`Clique em “${local?'Verificar LinkedIn':'Conectar conta'}” para concluir.`;
  }
 }catch(error){if(sequence===loadSequence)account.textContent=error.message;}
 update();
}
select.addEventListener('change',()=>{void chrome.storage.local.set({selectedPortal:select.value});void loadContext();});
window.addEventListener('focus',()=>{if(!busy)void loadContext();});
// Procura uma aba do portal com login ativo. Lê só o necessário para a conexão.
async function scanLogin(portal,provider,local){
 const origins=new Map();let authenticated=false;
 for(let scan=0;scan<2&&!authenticated;scan++){
  const tabs=await chrome.tabs.query({url:provider.domains.map(domain=>`https://*.${domain}/*`)});
  let disappeared=false;
  for(const tab of tabs.slice(0,20)){
   let url;try{url=new URL(tab.url||tab.pendingUrl);}catch{continue;}
   if(url.protocol!=='https:'||!sessionDomain(portal,url.hostname)||/signin|sign-in|\/login|checkpoint|challenge|authwall|signup/i.test(url.pathname))continue;
   let results;
   try{results=await chrome.scripting.executeScript({target:{tabId:tab.id},args:[provider.signedSelector,local],func:(selector,localOnly)=>{
    const signed=!!document.querySelector(selector)||[...document.querySelectorAll('button')].some(button=>/^(Sair|Logout|Sign out)$/i.test(button.textContent.trim()));
    if(!signed)return null;
    if(localOnly)return {origin:location.origin,authenticated:true};
    // No form fields, password inputs, Google data or unrelated storage keys.
    const local=[];
    for(let i=0;i<localStorage.length;i++){const name=localStorage.key(i);if(/token|auth|session/i.test(name))local.push({name,value:localStorage.getItem(name)});}
    return {origin:location.origin,localStorage:local};
   }});}catch(error){if(missingTab(error)){disappeared=true;continue;}throw error;}
   const state=results[0]?.result;
   if(state&&sessionDomain(portal,new URL(state.origin).hostname)){authenticated=true;origins.set(state.origin,state);}
  }
  if(!disappeared)break;
 }
 return {authenticated,origins};
}
connect.addEventListener('click',async()=>{
 if(connect.disabled||!context||!isBrowserSessionPortal(select.value))return;
 const portal=select.value,provider=browserConnectors[portal],expected=context;
 const local=browserConnectionMode(portal)==='local-browser';
 let destination=expected;
 busy=true;select.disabled=true;update();
 status.textContent=`Preparando a conexão com o ${provider.name}…`;
 try{
  // Request from this explicit click, before awaiting any other operation.
  const granted=await chrome.permissions.request({origins:provider.domains.map(domain=>`https://*.${domain}/*`)});
  if(!granted)throw new Error(`O acesso ao ${provider.name} não foi autorizado no Chrome.`);
  destination=await validateDestination(portal,expected);context=destination;
  if(local&&destination.mode!=='local-browser')throw new Error('O servidor precisa ser atualizado para verificar o LinkedIn no seu Chrome. Nenhuma sessão foi transferida.');
  let found=await scanLogin(portal,provider,local);
  if(!found.authenticated){
   // Abre o login e espera o usuário entrar; a conexão segue sozinha.
   await chrome.storage.local.set({selectedPortal:portal,pendingLoginPortal:portal});
   await chrome.tabs.create({url:provider.accountUrl,active:true});
   showStep(1);
   await feedback(destination,portal,`Entre na sua conta do ${provider.name} na aba que abrimos. Assim que o login for reconhecido, a conexão continua sozinha.`);
   const deadline=Date.now()+LOGIN_WAIT_MS;
   while(!found.authenticated&&Date.now()<deadline){
    await pause(LOGIN_POLL_MS);
    found=await scanLogin(portal,provider,local);
   }
   if(!found.authenticated)throw new Error(`Não reconhecemos o login no ${provider.name} a tempo. Entre na sua conta e clique em “Conectar conta” de novo.`);
  }
  showStep(2);
  const origins=found.origins;
  await feedback(destination,portal,`Login no ${provider.name} reconhecido. Conectando ao EmpreGatos…`);
  if(local){
   destination=await validateDestination(portal,expected);context=destination;
   const result=await message(destination.tabId,{type:'empregatos:verify-local-login',portal,expectedUserId:expected.account.id,authenticated:true,authorizeLocalConnection:true,extensionVersion:chrome.runtime.getManifest().version});
   if(!result?.ok)throw new Error(result?.error||'Não foi possível registrar a verificação do LinkedIn.');
   await chrome.storage.local.set({pendingLoginPortal:null});
   showStep(3);
   await feedback(destination,portal,'Login do LinkedIn reconhecido no seu Chrome. Verificação registrada; cookies e tokens permaneceram no navegador. O envio automático pelo LinkedIn continua indisponível.','verified');
   try{await chrome.tabs.update(destination.tabId,{active:true});}catch(error){if(!missingTab(error))throw error;}
   return;
  }
  const allCookies=(await Promise.all(provider.domains.map(domain=>chrome.cookies.getAll({domain})))).flat();
  const unique=new Map();
  for(const c of allCookies){
   if(!sessionDomain(portal,c.domain)||!c.secure||c.partitionKey)continue;
   unique.set(`${c.domain}|${c.path}|${c.name}`,{name:c.name,value:c.value,domain:c.domain,path:c.path,expires:c.expirationDate??-1,httpOnly:c.httpOnly,secure:true,sameSite:c.sameSite==='strict'?'Strict':c.sameSite==='lax'?'Lax':'None'});
  }
  destination=await validateDestination(portal,expected);context=destination;
  const transfer={type:'empregatos:import-session',portal,expectedUserId:expected.account.id,state:{cookies:[...unique.values()],origins:[...origins.values()]}};
  let result;
  try{result=await message(destination.tabId,transfer);}catch(error){
   // Only retry when Chrome guarantees that no receiver existed. Never replay
   // a transfer after a port closes or an unknown server outcome.
   if(!missingTab(error))throw error;
   destination=await validateDestination(portal,expected);context=destination;
   result=await message(destination.tabId,transfer);
  }
  if(!result?.ok)throw new Error(result?.error||`Não foi possível verificar a sessão do ${provider.name}.`);
  await chrome.storage.local.set({pendingLoginPortal:null});
  showStep(3);
  await feedback(destination,portal,`Conta do ${provider.name} verificada. Confirme e salve a conexão na aba do EmpreGatos.`,'verified');
  try{await chrome.tabs.update(destination.tabId,{active:true});}catch(error){if(!missingTab(error))throw error;status.textContent='A sessão foi verificada, mas a aba do EmpreGatos foi fechada. Abra a conexão no EmpreGatos para conferir antes de repetir.';}
 }catch(error){showStep(0);await feedback(destination,portal,missingTab(error)?'Uma aba foi fechada durante a conexão. Deixe o portal e o EmpreGatos abertos e tente novamente.':error.message,'error');}
 finally{busy=false;select.disabled=false;update();}
});
void chrome.storage.local.get('selectedPortal').then(saved=>{
 const requested=new URL(location.href||'https://invalid.test').searchParams.get('portal');
 if(isBrowserSessionPortal(requested))select.value=requested;
 else if(isBrowserSessionPortal(saved.selectedPortal))select.value=saved.selectedPortal;
 return loadContext();
});
