import {send} from '@vercel/queue';
import {proxyAuthorized} from './auth-config';
import {store} from './db';
import {eq} from './storage-types';
import {RequestError} from './errors';
/** Opt-in integration harness, disabled without all three deployment values.
 * Payload IDs come only from operator deployment config, never from the caller.
 * Uses a dedicated fictitious account and the normal production consumer. */
export async function publishQueueIntegration(key:unknown,replay=false,discovery=false) {
 const id=process.env.QUEUE_INTEGRATION_WORKSPACE,applicationId=process.env.QUEUE_INTEGRATION_APPLICATION;
 if(!id||!applicationId||!proxyAuthorized(key,process.env.QUEUE_INTEGRATION_KEY))throw Object.assign(new RequestError('Not found'),{statusCode:404});
 const workspaceId=discovery?process.env.QUEUE_INTEGRATION_DISCOVERY_WORKSPACE:id;
 if(!workspaceId)throw new RequestError('Isolated discovery workspace is not configured');
 const [row]=await store.select('workspaces',{where:eq('id',workspaceId)});
 const [user]=row?await store.select('users',{where:eq('id',row.userId),columns:['email']}):[];
 if(!row||!(discovery?/^queues-discovery-[a-f0-9-]+@example\.test$/.test(user?.email||''):user?.email==='queues-qa@example.test')||row.data.profile.email!=='queues-qa@example.test'||(!discovery&&!row.data.applications.some(a=>a.id===applicationId))||row.data.jobs.some(j=>!j.url.startsWith(process.env.QUEUE_INTEGRATION_RECEIVER+'/'))||row.data.sources.some(s=>!s.board.startsWith(process.env.QUEUE_INTEGRATION_RECEIVER+'/')))throw new RequestError('Invalid isolated integration workspace');
 if(discovery){const {enqueueDiscovery}=await import('./discovery-queue');return enqueueDiscovery(workspaceId,'user_triggered_automation');}
 return send('empregatos-submissions',{workspaceId:id,applicationId},{idempotencyKey:replay?`qa-replay:${crypto.randomUUID()}`:`qa:${applicationId}`,retentionSeconds:3600});
}
