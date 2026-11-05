// Development updates read only this extension's local files. No remote code,
// cookies, tabs from providers or user credentials are read by this worker.
const updateAlarm='empregatos-local-update';
let checking=null;
function newerVersion(next,current){
 const parse=value=>typeof value==='string'&&/^\d+(\.\d+){0,3}$/.test(value)?value.split('.').map(Number):null;
 const a=parse(next),b=parse(current);
 if(!a||!b||[...a,...b].some(n=>n>65535))return false;
 for(let index=0;index<4;index++){if((a[index]||0)!==(b[index]||0))return(a[index]||0)>(b[index]||0);}
 return false;
}
async function localJson(name){
 const response=await fetch(chrome.runtime.getURL(name),{cache:'no-store'});
 if(!response.ok)throw new Error('Local update metadata unavailable');
 return response.json();
}
async function checkLocalUpdate(){
 if(checking)return checking;
 checking=(async()=>{
  const release=await localJson('release.json');
  if(release.channel!=='development'||!newerVersion(release.version,chrome.runtime.getManifest().version))return{status:'unchanged'};
  const manifest=await localJson('manifest.json');
  // The build writes release.json last. Never reload a partial publication.
  if(manifest.version!==release.version)return{status:'partial'};
  const views=await chrome.runtime.getContexts({contextTypes:['POPUP','TAB']});
  if(views.some(view=>view.contextType==='POPUP'||view.documentUrl?.split(/[?#]/)[0]===chrome.runtime.getURL('popup.html')))return{status:'deferred'}; // An open connector may be transferring a session.
  chrome.runtime.reload();
  return{status:'reloading'};
 })().catch(error=>({status:'unavailable',error:String(error.message||error)})).finally(()=>{checking=null;});
 return checking;
}
async function initializeUpdater(){
 try{
  const release=await localJson('release.json');
  // Store-installed releases use Chrome's own automatic update mechanism.
  if(release.channel!=='development'||!chrome.alarms)return;
  if(!await chrome.alarms.get(updateAlarm))await chrome.alarms.create(updateAlarm,{periodInMinutes:1});
  await checkLocalUpdate();
 }catch{} // Offline/unavailable local metadata never interrupts a connection.
}
async function openConnector(portal,destinationTabId){
 const contexts=await chrome.runtime.getContexts({contextTypes:['TAB']});
 const base=chrome.runtime.getURL('popup.html');
 const current=contexts.find(context=>context.documentUrl?.split(/[?#]/)[0]===base&&context.tabId>=0);
 const target=base+(['gupy','infojobs','glassdoor','linkedin'].includes(portal)?'?portal='+portal+(Number.isSafeInteger(destinationTabId)&&destinationTabId>=0?'&tab='+destinationTabId:''):'');
 if(current){
  try{
   // Focusing the same portal must not reload an authorization in progress.
   await chrome.tabs.update(current.tabId,{active:true,...(portal&&current.documentUrl!==target?{url:target}:{})});
   return;
  }catch(error){
   // A disappeared tab is definitive. Other failures must not spawn duplicates.
   if(!/no tab with id|invalid tab id|tab was closed/i.test(String(error?.message||error)))throw error;
  }
 }
 await chrome.tabs.create({url:target});
}
function projectTab(url){
 try{const parsed=new URL(url);return parsed.origin==='https://curriculoautomatico.vercel.app'&&parsed.pathname==='/app';}catch{return false;}
}
async function refreshProjectBridges(){
 const tabs=await chrome.tabs.query({url:'https://curriculoautomatico.vercel.app/app*'});
 for(const tab of tabs){
  if(!projectTab(tab.url||tab.pendingUrl))continue;
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['config.js','content.js']}).catch(()=>{});
 }
}
chrome.runtime.onInstalled.addListener(()=>{void initializeUpdater();void refreshProjectBridges().catch(()=>{});});
chrome.runtime.onStartup.addListener(()=>{void initializeUpdater();});
chrome.alarms?.onAlarm.addListener(alarm=>{if(alarm.name===updateAlarm)void checkLocalUpdate();});
chrome.action?.onClicked.addListener(()=>{void openConnector().catch(()=>{});});
chrome.runtime.onMessage?.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||!projectTab(sender.tab?.url)||message?.type!=='empregatos:open-connector')return;
 if(!['gupy','infojobs','glassdoor','linkedin'].includes(message.portal)){respond({ok:false});return;}
 const source=new URL(sender.tab.url);
 const destination=source.searchParams.get('flow')==='connections'&&source.searchParams.get('portal')===message.portal?sender.tab.id:undefined;
 openConnector(message.portal,destination).then(()=>respond({ok:true})).catch(()=>respond({ok:false}));return true;
});
void initializeUpdater();
