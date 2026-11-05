import {sessionTransferSuspension as defaultSuspension} from '../shared/session-transfer-policy';

/** Retired switch: even an old production setting must not restore copying. */
export function linkedinSessionRetestEnabled(_userId:string){
 return false;
}
export const sessionTransferSuspension=(portal:string,userId:string)=>defaultSuspension(portal,linkedinSessionRetestEnabled(userId));
