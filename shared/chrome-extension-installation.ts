/** Configure only after the store listing has actually been published. */
export function chromeWebStoreListing(value:unknown){
 if(typeof value!=='string'||!value.trim())return null;
 try{
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||url.hostname!=='chromewebstore.google.com'||url.port||url.username||url.password)return null;
  if(!/^\/detail\/(?:[^/]+\/)?[a-p]{32}\/?$/.test(url.pathname))return null;
  url.search='';url.hash='';return url.href;
 }catch{return null;}
}
