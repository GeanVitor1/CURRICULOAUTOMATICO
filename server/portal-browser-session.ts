import {z} from 'zod';
import {sessionDomain,browserConnectors,type BrowserSessionPortal} from '../shared/browser-connectors';
export function portalBrowserSessionSchema(portal:BrowserSessionPortal){
 const origin=z.string().max(250).refine(value=>{
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.origin===value&&sessionDomain(portal,u.hostname);}catch{return false;}
 },`A sessão deve conter somente origens do ${browserConnectors[portal].name}.`);
 return z.object({
  cookies:z.array(z.object({name:z.string().min(1).max(300),value:z.string().max(32768),domain:z.string().max(250).refine(v=>sessionDomain(portal,v)),
   path:z.string().max(2048).startsWith('/'),expires:z.number().finite(),httpOnly:z.boolean(),secure:z.literal(true),sameSite:z.enum(['Strict','Lax','None']),
  }).strict()).max(150),
  origins:z.array(z.object({origin,localStorage:z.array(z.object({name:z.string().min(1).max(300),value:z.string().max(131072)}).strict()).max(60)}).strict()).max(12),
 }).strict().refine(s=>s.cookies.length>0||s.origins.some(o=>o.localStorage.length),`Nenhuma sessão do ${browserConnectors[portal].name} foi encontrada no Chrome.`);
}
export type PortalBrowserSession=z.infer<ReturnType<typeof portalBrowserSessionSchema>>;
