import {it,expect} from 'vitest';
import {browserConnectors,type BrowserSessionPortal} from '../shared/browser-connectors';
import {portalBrowserSessionSchema} from '../server/portal-browser-session';
it.each(Object.keys(browserConnectors) as BrowserSessionPortal[])('accepts only %s session domains and rejects cross-provider, password and oversized exports',portal=>{
 const domain=browserConnectors[portal].domains[0],cookie={name:'session',value:'synthetic',domain:'.'+domain,path:'/',expires:-1,httpOnly:true,secure:true,sameSite:'Lax'};
 const state={cookies:[cookie],origins:[{origin:'https://www.'+domain,localStorage:[{name:'authToken',value:'synthetic'}]}]};
 const schema=portalBrowserSessionSchema(portal);expect(schema.safeParse(state).success).toBe(true);
 const others=Object.entries(browserConnectors).filter(([key])=>key!==portal).flatMap(([,p])=>p.domains);
 for(const domain of [...others,'google.com','localhost','127.0.0.1',cookie.domain+'.evil.test','evil'+browserConnectors[portal].domains[0]])
  expect(schema.safeParse({...state,cookies:[{...cookie,domain}]}).success).toBe(false);
 for(const origin of ['http://www.'+domain,'https://u:p@www.'+domain,'https://www.'+domain+'/path','https://accounts.google.com'])
  expect(schema.safeParse({...state,origins:[{origin,localStorage:[]}]}).success).toBe(false);
 for(const bad of [{cookies:[],origins:[]},{...state,password:'never'},{...state,cookies:[{...cookie,secure:false}]},{...state,cookies:[{...cookie,value:'x'.repeat(32769)}]}])
  expect(schema.safeParse(bad).success).toBe(false);
});
