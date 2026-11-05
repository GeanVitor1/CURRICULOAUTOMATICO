import type {LocalLoginObservation} from '../shared/session-transfer-policy';

export const LOCAL_LOGIN_TTL=15*60_000;
/** A past observation is not proof of an active cloud session. */
export function localLoginStatus(observation:LocalLoginObservation|null|undefined,now=Date.now()){
 const recent=!!observation&&Number.isFinite(Date.parse(observation.observedAt))&&
  Date.parse(observation.observedAt)<=now&&observation.expiresAt>now&&
  observation.expiresAt-Date.parse(observation.observedAt)<=LOCAL_LOGIN_TTL;
 return {id:'linkedin' as const,connected:false,connectable:true,cloud:false,
  connectionMode:'local-browser' as const,localLoginVerified:recent,
  sessionState:recent?'local_verified' as const:observation?'local_stale' as const:'disconnected' as const,
  sessionSaved:false,verifiedAt:observation?.observedAt||null,connectedAt:null,
  profileResumeId:null,browserAvailable:true,submissionEnabled:false};
}
