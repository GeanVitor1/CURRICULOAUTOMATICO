import { randomUUID } from "node:crypto";
import { traceJob } from "./automation-trace";
import { send } from "@vercel/queue";
import { store, readWorkspace, mutateWorkspace } from "./db";
import { and, asc, eq, inArray, lt, or } from "./storage-types";
import { vercelQueueEnabled } from "./automation-runtime";
import { resolveApplicationDestinations } from "./destination-resolver";
import {
  companyOpportunities,
  claimPublicResolution,
  finishPublicResolution,
} from "./opportunity-catalog";
import { searchEquivalentUrls } from "./equivalent-search";
import {
  analyze,
  eligibleForDestinationResearch,
  matchesSelectedSites,
} from "./engine";
import { readyPortals } from "./portal-sessions";
import {
  prepare,
  queuePreparedApplications,
  processAutomaticApplications,
} from "./operations";
import { discoveryBudgetExpired } from "./discovery-budget";
import type { Job, Workspace } from "../shared/types";
import { detectAts } from "./ats-registry";
import { companyIdentity, opportunityKey } from "./job-identity";
/** Spend the research budget first on independent ATS publications and their apply links. */
export function destinationResearchPriority(job: Job) {
  return [job.url, ...(job.applicationUrls || []).map((link) => link.url)].some(
    (url) => {
      const platform = detectAts(url)?.platform;
      return (
        platform &&
        ["greenhouse", "lever", "ashby", "smartrecruiters"].includes(platform)
      );
    },
  )
    ? 1
    : 0;
}
export function needsResearch(job: Job, workspace: Workspace) {
  return (
    !job.discarded &&
    job.availability !== "closed" &&
    !workspace.submissionExclusions?.includes(opportunityKey(job)) &&
    !workspace.applications.some(
      (a) =>
        a.jobId === job.id &&
        (a.submittedAt ||
          ["Enviando", "Resultado desconhecido"].includes(a.status)),
    ) &&
    !workspace.applications.some(
      (a) =>
        a.jobId === job.id &&
        a.history.some((e) =>
          /exige verificação humana|solicitou verificação humana/.test(
            e.message,
          ),
        ),
    ) &&
    matchesSelectedSites(job, workspace) &&
    eligibleForDestinationResearch(job, workspace) &&
    (!job.resolution || Date.parse(job.resolution.retryAt) <= Date.now())
  );
}
export function researchAllowance(workspace: Workspace) {
  // An automatic cycle advances through its finite pool in small queue batches.
  // The manual diagnostic budget must never stop a cycle with submission quota left.
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const used = workspace.jobs.filter(
    (job) =>
      job.resolution &&
      new Date(job.resolution.checkedAt).toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      }) === today,
  ).length;
  if (workspace.routine.enabled && workspace.routine.mode === "automatic") {
    const budget=workspace.routine.researchBudget;
    const consumed=Math.max(used,budget?.day===today?budget.used:0);
    const maximum=Math.max(4,Math.min(2000,Number(process.env.DESTINATION_RESEARCH_AUTOMATIC_DAILY_LIMIT)||200));
    return Math.min(workspace.jobs.filter(job=>needsResearch(job,workspace)).length,Math.max(0,maximum-consumed));
  }
  return Math.max(
    0,
    Math.min(
      workspace.routine.dailyLimit * 4,
      Math.max(
        1,
        Math.min(
          100,
          Number(process.env.DESTINATION_RESEARCH_DAILY_LIMIT) || 20,
        ),
      ),
    ) - used,
  );
}

/** Spread a bounded budget across employers, including previous batches today.
 * A single large board must not consume every slot before alternatives are read.
 * An explicitly requested job still takes precedence. */
export function selectResearchJobs(
  workspace: Workspace,
  requestedIds: string[],
  limit: number,
) {
  const requested = new Set(requestedIds);
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const used = new Map<string, number>();
  const employer = (job: Job) =>
    companyIdentity(job.company) || new URL(job.url).hostname;
  for (const job of workspace.jobs) {
    if (
      job.resolution &&
      new Date(job.resolution.checkedAt).toLocaleDateString("en-CA", {
        timeZone: "America/Sao_Paulo",
      }) === today
    ) {
      const key = employer(job);
      used.set(key, (used.get(key) || 0) + 1);
    }
  }
  const candidates = workspace.jobs
    .filter(
      (job) =>
        (requested.has(job.id) &&
          !job.discarded &&
          job.availability !== "closed" &&
          (!job.resolution ||
            Date.parse(job.resolution.retryAt) <= Date.now())) ||
        needsResearch(job, workspace),
    )
    .map((job) => ({
      job,
      match: analyze(job, workspace.profile, workspace.filters),
    }));
  const selected: Job[] = [];
  while (candidates.length && selected.length < limit) {
    candidates.sort(
      (a, b) =>
        Number(requested.has(b.job.id)) - Number(requested.has(a.job.id)) ||
        Number(b.match.score >= workspace.routine.minScore) -
          Number(a.match.score >= workspace.routine.minScore) ||
        (used.get(employer(a.job)) || 0) - (used.get(employer(b.job)) || 0) ||
        destinationResearchPriority(b.job) -
          destinationResearchPriority(a.job) ||
        b.match.score - a.match.score,
    );
    const { job } = candidates.shift()!;
    selected.push(job);
    const key = employer(job);
    used.set(key, (used.get(key) || 0) + 1);
  }
  return selected;
}

export const RESOLUTION_TOPIC = "empregatos-destinations";
export async function dispatchResolution(taskId: string) {
  if (vercelQueueEnabled())
    await send(
      RESOLUTION_TOPIC,
      { taskId },
      { idempotencyKey: `resolve:${taskId}`, retentionSeconds: 604800 },
    );
}
export async function enqueueResolution(
  workspaceId: string,
  requestedJobIds: string[] = [],
) {
  const taskId = await store.transaction(async (tx) => {
    const [owner] = await tx.select("workspaces", {
      where: eq("id", workspaceId),
      columns: ["id", "demo"],
      lock: true,
    });
    if (!owner || owner.demo) return null;
    const [pending] = await tx.select("resolutionTasks", {
      where: and(
        eq("workspaceId", workspaceId),
        inArray("status", ["queued", "running"]),
      ),
      columns: ["id", "requestedJobIds"],
    });
    if (pending) {
      if (requestedJobIds.length)
        await tx.update(
          "resolutionTasks",
          {
            requestedJobIds: [
              ...new Set([
                ...(pending.requestedJobIds || []),
                ...requestedJobIds,
              ]),
            ].slice(0, 100),
          },
          eq("id", pending.id),
        );
      return pending.id;
    }
    const id = randomUUID();
    await tx.insert("resolutionTasks", { id, workspaceId, requestedJobIds });
    return id;
  });
  if (taskId) await dispatchResolution(taskId);
  return taskId;
}
export class ResolutionBusyError extends Error {}
export async function processResolutionTask(taskId?: string) {
  const leaseToken = randomUUID();
  const task = await store.transaction(async (tx) => {
    const [row] = await tx.select("resolutionTasks", {
      where: and(
        taskId ? eq("id", taskId) : undefined,
        or(
          eq("status", "queued"),
          and(eq("status", "running"), lt("leaseUntil", new Date())),
        ),
      ),
      orderBy: [asc("createdAt")],
      limit: 1,
      lock: true,
      skipLocked: true,
    });
    if (!row) {
      if (taskId) {
        const [active] = await tx.select("resolutionTasks", {
          where: eq("id", taskId),
          columns: ["status"],
        });
        if (active?.status === "running") throw new ResolutionBusyError();
      }
      return null;
    }
    if (row.attempts >= 3) {
      await tx.update(
        "resolutionTasks",
        {
          status: "failed",
          lastError:
            "Resolução interrompida três vezes; aguarda próxima busca.",
          leaseToken: null,
          leaseUntil: null,
        },
        eq("id", row.id),
      );
      return null;
    }
    await tx.update(
      "resolutionTasks",
      {
        status: "running",
        attempts: row.attempts + 1,
        leaseToken,
        leaseUntil: new Date(Date.now() + 360000),
        updatedAt: new Date(),
      },
      eq("id", row.id),
    );
    return row;
  });
  if (!task) return false;
  const claim = and(eq("id", task.id), eq("leaseToken", leaseToken));
  try {
    const workspace = await readWorkspace(task.workspaceId);
    const [owner] = await store.select("workspaces", {
      where: eq("id", task.workspaceId),
      columns: ["userId"],
    });
    if (!workspace || workspace.demo || !owner) {
      await store.update(
        "resolutionTasks",
        { status: "completed", leaseToken: null, leaseUntil: null },
        claim,
      );
      return true;
    }
    if (workspace.routine.enabled && workspace.routine.mode === "automatic") {
      const { accountPlan, billingDay } = await import("./billing");
      const { dailySubmissionAttempts } = await import("./submission-attempts");
      const plan = await accountPlan(owner.userId);
      const used = Math.max(
        dailySubmissionAttempts(workspace),
        await store.count(
          "applicationUsage",
          and(eq("userId", owner.userId), eq("day", billingDay())),
        ),
      );
      if (used >= Math.min(workspace.routine.dailyLimit, plan.dailyLimit)) {
        await store.update(
          "resolutionTasks",
          {
            status: "completed",
            leaseToken: null,
            leaseUntil: null,
            updatedAt: new Date(),
          },
          claim,
        );
        await (
          await import("./automatic-cycle")
        ).continueAutomaticCycle(task.workspaceId, { allowResearch: false });
        return true;
      }
    }
    const jobs = selectResearchJobs(
      workspace,
      task.requestedJobIds || [],
      Math.min(4, researchAllowance(workspace)),
    );
    const resolveJob = async (job: Job) => {
    await mutateWorkspace(task.workspaceId,async(w,tx)=>{
      const [active]=await tx.select("resolutionTasks",{where:claim,columns:["id"],lock:true});
      if(!active)throw new ResolutionBusyError();
      const day=new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
      const old=w.routine.researchBudget;
      const historical=w.jobs.filter(job=>job.resolution&&new Date(job.resolution.checkedAt).toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"})===day).length;
      w.routine.researchBudget={day,used:Math.max(historical,old?.day===day?old.used:0)+1};
    });
      const candidates = await companyOpportunities(job.company);
      const publicClaim = await claimPublicResolution(job);
      let resolved = publicClaim.cached;
      if (!resolved && publicClaim.token) {
        try {
          resolved = await resolveApplicationDestinations(job, {
            candidates,
            search: (item) => searchEquivalentUrls(item, owner.userId),
          });
          await finishPublicResolution(
            publicClaim.key,
            publicClaim.token,
            resolved,
          );
        } catch (error) {
          await finishPublicResolution(
            publicClaim.key,
            publicClaim.token,
          ).catch(() => {});
          throw error;
        }
      }
      if (!resolved) return;
      await mutateWorkspace(task.workspaceId, async (w, tx) => {
        const [active] = await tx.select("resolutionTasks", {
          where: claim,
          columns: ["id"],
          lock: true,
        });
        if (!active) throw new ResolutionBusyError();
        const current = w.jobs.find(
          (item) => item.id === job.id && item.url === job.url,
        );
        if (!current) return;
        current.destinations = resolved!.destinations;
        // Destination lookup cannot erase a still-current, independently verified channel.
        if (resolved!.emailDestination)
          current.emailDestination = resolved!.emailDestination;
        current.resolution = resolved!.resolution;
        traceJob(current,"destination",resolved!.emailDestination ? "published_email_verified" : resolved!.destinations?.some(d=>d.state==="blocked") ? "destination_blocked" : resolved!.destinations?.some(d=>d.state==="login_required") ? "login_required" : resolved!.destinations?.some(d=>d.state==="verified"&&d.formFound) ? "public_form_verified" : "supported_form_not_found");
        // Public detail can replace a truncated discovery snippet. Candidate matching
        // is recomputed for this account; shared recommendations are never copied.
        if (resolved!.description.length > current.description.length) {
          current.description = resolved!.description;
          current.company = resolved!.company;
          current.location = resolved!.location;
          current.modality = resolved!.modality;
          current.level = resolved!.level;
          current.contract = resolved!.contract;
        }
        for (const candidate of candidates)
          if (
            resolved!.resolution?.matches.some(
              (m) => m.url === candidate.url && m.verified,
            )
          )
            for (const origin of candidate.origins)
              if (
                !current.origins.some(
                  (o) => o.source === origin.source && o.id === origin.id,
                )
              )
                current.origins.push(origin);
        if (
          w.routine.enabled &&
          w.routine.mode === "approval" &&
          !w.applications.some((a) => a.jobId === current.id)
        ) {
          try {
            prepare(w, current.id);
          } catch {
            /* Profile/resume still requires review. */
          }
        }
      });
    };
    // Two independent public lookups at a time; workspace writes remain transactional.
    // Explicit user priorities retain their order.
    const width = task.requestedJobIds?.length ? 1 : 2;
    for (let offset = 0; offset < jobs.length; offset += width) {
      if (discoveryBudgetExpired()) break;
      const results = await Promise.allSettled(
        jobs.slice(offset, offset + width).map(resolveJob),
      );
      const failed = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failed) throw failed.reason;
    }
    const current = await readWorkspace(task.workspaceId);
    const native = await readyPortals(
      owner.userId,
      current?.resumes[0]?.id || "",
    );
    await mutateWorkspace(task.workspaceId, async (w, tx) => {
      if (w.routine.enabled && w.routine.mode === "automatic") {
        const { accountPlan, billingDay } = await import("./billing");
        const { dailySubmissionAttempts } =
          await import("./submission-attempts");
        const plan = await accountPlan(owner.userId, tx);
        const historical = dailySubmissionAttempts(w);
        const used = await tx.count(
          "applicationUsage",
          and(eq("userId", owner.userId), eq("day", billingDay())),
        );
        queuePreparedApplications(
          w,
          native,
          Math.min(w.routine.dailyLimit, plan.dailyLimit) -
            Math.max(0, used - historical),
        );
      }
    });
    const latestTask = await store.transaction(async (tx) => {
      // Serialize completion with enqueue so a request appended during execution is not lost.
      await tx.select("workspaces", {
        where: eq("id", task.workspaceId),
        columns: ["id"],
        lock: true,
      });
      const [active] = await tx.select("resolutionTasks", {
        where: claim,
        columns: ["requestedJobIds"],
        lock: true,
      });
      if (!active) throw new ResolutionBusyError();
      await tx.update(
        "resolutionTasks",
        {
          status: "completed",
          leaseToken: null,
          leaseUntil: null,
          lastError: null,
          updatedAt: new Date(),
        },
        claim,
      );
      return active;
    });
    await processAutomaticApplications(task.workspaceId);
    const remaining = await readWorkspace(task.workspaceId);
    const pendingRequests = (latestTask?.requestedJobIds || []).filter((id) =>
      remaining?.jobs.some(
        (job) =>
          job.id === id &&
          !job.discarded &&
          job.availability !== "closed" &&
          (!job.resolution || Date.parse(job.resolution.retryAt) <= Date.now()),
      ),
    );
    const { dailySubmissionAttempts } = await import("./submission-attempts");
    const { accountPlan, billingDay } = await import("./billing");
    const plan = await accountPlan(owner.userId);
    const used = Math.max(
      dailySubmissionAttempts(remaining || { applications: [] }),
      await store.count(
        "applicationUsage",
        and(eq("userId", owner.userId), eq("day", billingDay())),
      ),
    );
    if (
      remaining &&
      (remaining.routine.mode !== "automatic" ||
        used < Math.min(remaining.routine.dailyLimit, plan.dailyLimit)) &&
      researchAllowance(remaining) > 0 &&
      (pendingRequests.length ||
        (remaining.routine.enabled &&
          remaining.jobs.some((job) => needsResearch(job, remaining))))
    )
      await enqueueResolution(task.workspaceId, pendingRequests);
    await (
      await import("./automatic-cycle")
    ).continueAutomaticCycle(task.workspaceId, { allowResearch: false });
    return true;
  } catch (error) {
    await store.update(
      "resolutionTasks",
      {
        status: "queued",
        leaseToken: null,
        leaseUntil: null,
        lastError:
          "Falha na busca de destinos. Nenhum envio foi confirmado nesta etapa.",
        updatedAt: new Date(),
      },
      claim,
    );
    throw error;
  }
}
export async function recoverResolutionTasks() {
  const rows = await store.select("resolutionTasks", {
    where: or(
      eq("status", "queued"),
      and(eq("status", "running"), lt("leaseUntil", new Date())),
    ),
    columns: ["id"],
    limit: 100,
  });
  for (const row of rows) await dispatchResolution(row.id);
}
