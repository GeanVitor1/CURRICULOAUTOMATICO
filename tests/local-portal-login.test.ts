import {it,expect} from 'vitest';
import {LOCAL_LOGIN_TTL,localLoginStatus} from '../server/local-portal-login';
it('never treats a local observation as a saved cloud connection or submission permission',()=>{
 const now=Date.now(),status=localLoginStatus({observedAt:new Date(now).toISOString(),expiresAt:now+LOCAL_LOGIN_TTL,extensionVersion:'2.0.6'},now);
 expect(status).toMatchObject({connected:false,connectable:true,localLoginVerified:true,cloud:false,sessionSaved:false,submissionEnabled:false,sessionState:'local_verified'});
});
it('expires past observations and rejects future or excessively long observations',()=>{
 const now=Date.now();
 for(const observation of [
  {observedAt:new Date(now-LOCAL_LOGIN_TTL).toISOString(),expiresAt:now},
  {observedAt:new Date(now+1000).toISOString(),expiresAt:now+LOCAL_LOGIN_TTL},
  {observedAt:new Date(now).toISOString(),expiresAt:now+LOCAL_LOGIN_TTL+1},
 ])expect(localLoginStatus({...observation,extensionVersion:'2.0.6'},now)).toMatchObject({localLoginVerified:false,connected:false,sessionState:'local_stale'});
 expect(localLoginStatus(null,now)).toMatchObject({sessionState:'disconnected',connectable:true,connected:false});
});
