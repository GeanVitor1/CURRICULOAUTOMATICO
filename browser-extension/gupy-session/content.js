/* global chrome, EmpreGatosPortals */
(()=>{
 const marker='__empregatosConnectorBridge',old=globalThis[marker];
 if(old){chrome.runtime.onMessage.removeListener(old.message);window.removeEventListener('message',old.window);}
 const currentPortal=()=>location.origin==='https://curriculoautomatico.vercel.app'&&location.pathname==='/app'?new URL(location.href).searchParams.get('portal'):null;
 const publish=(text,kind='ready')=>{
  const portal=currentPortal();if(!EmpreGatosPortals.isBrowserSessionPortal(portal))return;
  window.postMessage({type:'empregatos:connector-status',portal,version:chrome.runtime.getManifest().version,text:String(text||'').slice(0,800),kind},location.origin);
 };
 const listener=(message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return;
  const legacy=message?.type==='empregatos:import-gupy',importing=legacy||message?.type==='empregatos:import-session';
  const local=message?.type==='empregatos:verify-local-login';
  if(!importing&&!local&&!['empregatos:connection-context','empregatos:connector-progress'].includes(message?.type))return;
  const portal=legacy?'gupy':message.portal;
  if(!EmpreGatosPortals.isBrowserSessionPortal(portal)||currentPortal()!==portal){respond({error:'Abra a conexão do portal escolhido no EmpreGatos.'});return;}
  if(message.type==='empregatos:connector-progress'){
   publish(message.text,['connecting','error','verified'].includes(message.kind)?message.kind:'connecting');respond({ok:true});return;
  }
  if(importing&&portal==='linkedin'){respond({error:'Use o conector 2.0.6 ou posterior para verificar o LinkedIn no próprio Chrome, sem transferir a sessão.'});return;}
  if(local&&portal!=='linkedin'){respond({error:'Este portal usa outro fluxo de conexão.'});return;}
  const request=local?fetch(`/api/connections/${portal}/local-browser`,{
   method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-Orbita-Request':'1'},
   body:JSON.stringify({authorizeLocalConnection:message.authorizeLocalConnection,expectedUserId:message.expectedUserId,authenticated:message.authenticated,extensionVersion:message.extensionVersion}),
  }):importing?fetch(`/api/connections/${portal}/browser-session`,{
   method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(75000),headers:{'Content-Type':'application/json','X-Orbita-Request':'1'},
   body:JSON.stringify({authorizeSessionTransfer:true,state:message.state,...(message.expectedUserId?{expectedUserId:message.expectedUserId}:{})}),
  }):fetch(`/api/connections/browser-extension-context?portal=${encodeURIComponent(portal)}`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
  request.then(async response=>{
   let result;
   try{result=await response.json();}catch{throw new Error('O servidor não retornou uma resposta válida. Confira a conexão no EmpreGatos antes de tentar novamente.');}
   if(!response.ok)throw new Error(response.status===401?'Entre na sua conta do EmpreGatos antes de conectar.':typeof result?.error==='string'?result.error:'Não foi possível verificar esta conexão.');
   if(local){
    if(result?.portal!==portal||result.mode!=='local-browser'||result.automatic!==false||!Number.isFinite(Date.parse(result.localLogin?.observedAt)))throw new Error('O servidor não confirmou o registro do login. Confira a conexão no EmpreGatos antes de tentar novamente.');
    window.postMessage({type:'empregatos:local-login-verified',portal},location.origin);respond({ok:true});
   }
   else if(importing){
    if(result?.authenticated!==true||typeof result.viewerId!=='string'||!result.viewerId||typeof result.image!=='string'||!result.image.startsWith('data:image/'))throw new Error('O servidor ainda não confirmou o login do portal. Abra a conexão no EmpreGatos e confira se há alguma verificação pendente.');
    window.postMessage(portal==='gupy'?{type:'empregatos:gupy-browser-session',frame:result}:{type:'empregatos:browser-session',portal,frame:result},location.origin);respond({ok:true});
   }else respond({ok:true,context:result});
  }).catch(error=>{
   const text=error.name==='TimeoutError'||error.name==='AbortError'?'A verificação demorou mais que o esperado. Confira a conexão no EmpreGatos antes de tentar novamente.':error instanceof TypeError?'Não foi possível comunicar com o servidor. Confira sua conexão e o resultado no EmpreGatos antes de tentar novamente.':error.message;
   if(importing||local)publish(text,'error');respond({error:text});
  });
  return true;
 };
 const windowListener=event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.portal!==currentPortal())return;
  if(event.data.type==='empregatos:request-connector-status')publish(readyText());
  if(event.data.type==='empregatos:request-open-connector'){
   chrome.runtime.sendMessage({type:'empregatos:open-connector',portal:currentPortal()}).then(result=>{if(!result?.ok)publish('Não foi possível abrir o conector. Abra-o pelo ícone de extensões do Chrome.','error');}).catch(()=>publish('Reabra a extensão do EmpreGatos no Chrome.','error'));
  }
 };
 chrome.runtime.onMessage.addListener(listener);window.addEventListener('message',windowListener);
 globalThis[marker]={message:listener,window:windowListener};
 function readyText(){return currentPortal()==='linkedin'?'Conector disponível. Abra a aba do conector para verificar o login no seu Chrome, sem transferir a sessão.':'Conector disponível. Abra a aba do conector para autorizar a transferência.';}
 publish(readyText());
})();
