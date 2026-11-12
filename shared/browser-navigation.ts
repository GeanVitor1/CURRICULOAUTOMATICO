import {isBrowserSessionPortal} from './browser-connectors';

type BrowserStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const returnKey='empregatos:login-return';
const pages=new Set(['automacao','curriculo','dados','preferencias','perfil-inteligente','candidaturas','vagas','conta','conexoes']);

// Only app routes are accepted, never a caller-controlled origin or OAuth URL.
export function safeAppReturn(value:string|null|undefined):string|null{
 if(!value?.startsWith('/')||value.startsWith('//')||value.includes('\\'))return null;
 try{
  const url=new URL(value,'https://return.invalid');
  if(url.origin!=='https://return.invalid'||url.pathname!=='/app')return null;
  const portal=url.searchParams.get('portal');
  if(portal&&isBrowserSessionPortal(portal))return '/app?portal='+portal+(url.searchParams.get('flow')==='connections'?'&flow=connections':'');
  const page=url.hash.slice(1);
  return pages.has(page)?'/app#'+page:'/app';
 }catch{return null;}
}
export function rememberAppReturn(storage:BrowserStorage|null,value:string){
 const target=safeAppReturn(value);
 try{if(target)storage?.setItem(returnKey,target);}catch{}
 return target;
}
export function pendingAppReturn(search:string,storage:BrowserStorage|null):string|null{
 const explicit=safeAppReturn(new URLSearchParams(search).get('returnTo'));
 if(explicit)return explicit;
 try{return safeAppReturn(storage?.getItem(returnKey));}catch{return null;}
}
export function clearAppReturn(storage:BrowserStorage|null){try{storage?.removeItem(returnKey);}catch{}}
export function authEntryPath(path:'/login'|'/register',target:string|null){
 const safe=safeAppReturn(target);
 return path+(safe?'?returnTo='+encodeURIComponent(safe):'');
}
export function storedTheme(storage:BrowserStorage|null):'dark'|'light'{
 try{return storage?.getItem('orbita-theme')==='dark'?'dark':'light';}catch{return 'light';}
}
export function saveTheme(storage:BrowserStorage|null,theme:'dark'|'light'){try{storage?.setItem('orbita-theme',theme);}catch{}}
