import {AsyncLocalStorage} from 'node:async_hooks';
import type {Workspace} from '../shared/types';
import {dailySubmissionAttempts} from './submission-attempts';
import {permittedJobSource} from '../shared/job-source-policy';

export const discoveryDay = (date = new Date()) => date.toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'});
/** At most three inspected candidates per daily slot, in batches of at most 30. */
export function discoveryQuota(w: Workspace, planLimit: number, recordedUsage = 0, date = new Date()) {
  const day = discoveryDay(date);
  const target = Math.max(0, Math.floor(Math.min(w.routine.dailyLimit, planLimit)));
  const used = Math.max(recordedUsage, dailySubmissionAttempts(w, date));
  const pending = w.applications.filter(a => a.status === 'Aguardando aprovação' &&
    w.jobs.some(j => j.id === a.jobId && permittedJobSource(j)) &&
    !dailySubmissionAttempts({applications:[a]}, date)).length;
  const remaining = Math.max(0, target - used - pending);
  const maximum = target * 3;
  const examined = w.routine.discoveryBudget?.day === day ? w.routine.discoveryBudget.examined : 0;
  return {day, target, remaining, maximum, examined,
    candidateLimit: Math.max(0, Math.min(30, remaining * 3, maximum - examined))};
}
const candidates = new AsyncLocalStorage<{limit:number;examined:number}>();
export function discoveryCandidateLimit(fallback: number) {
  const budget = candidates.getStore();
  return budget ? Math.max(0, Math.min(fallback, budget.limit - budget.examined)) : fallback;
}
export function takeDiscoveryCandidate() {
  const budget = candidates.getStore();
  if (!budget) return true;
  if (budget.examined >= budget.limit) return false;
  budget.examined++;
  return true;
}
export async function withDiscoveryCandidates<T>(limit: number, run: () => Promise<T>, consumed?: (examined:number)=>void) {
  const budget = {limit:Math.max(0, Math.floor(limit)),examined:0};
  try {
    const value = await candidates.run(budget, run);
    return {value, examined:budget.examined};
  } finally { consumed?.(budget.examined); }
}
