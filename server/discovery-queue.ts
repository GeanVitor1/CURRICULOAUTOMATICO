import { RequestError, StaleDiscoveryClaimError } from "./errors";
import { randomUUID } from "node:crypto";
import type { ExecutionOrigin } from "../shared/types";
import { and, asc, eq, inArray, lt, or } from "./storage-types";
import { store, mutateWorkspace } from "./db";
import { dispatchDiscovery } from "./vercel-dispatch";
import {
  discover,
  notify,
  processAutomaticApplications,
  recoverInterruptedSends,
} from "./operations";

export async function enqueueDiscovery(workspaceId: string, origin: ExecutionOrigin = "user_triggered_automation", continuation = false) {
  const result = await store.transaction(async (tx) => {
    // The workspace lock makes the uniqueness check/queue marker atomic across API processes.
    const [row] = await tx.select("workspaces", {
      where: eq("id", workspaceId),
      lock: true,
    });
    if (!row) throw new RequestError("Workspace não encontrado.");
    if (row.demo)
      throw new RequestError("A demonstração não consulta fontes externas.");
    const [pending] = await tx.select("discoveryTasks", {
      where: and(
        eq("workspaceId", workspaceId),
        inArray("status", ["queued", "running"]),
      ),
    });
    if (pending)
      return {
        id: pending.id,
        status: pending.status,
        message: "Sua busca já está na fila. Os resultados aparecerão aqui.",
      };
    if (!row.data.sources.some((source) => source.enabled && source.discovery))
      throw new RequestError(
        "Configure pelo menos uma fonte antes de pesquisar.",
      );
    const id = randomUUID(),
      at = new Date();
    await tx.insert("discoveryTasks", { id, workspaceId, status: "queued" });
    row.data.runs.unshift({
      origin,
      continuation,
      id,
      at: at.toISOString(),
      status: "queued",
      discovered: 0,
      processed: 0,
      errors: [],
      message:
        "Busca na fila. Os resultados serão atualizados automaticamente.",
    });
    row.data.runs = row.data.runs.slice(0, 100);
    await tx.update(
      "workspaces",
      { data: row.data, updatedAt: at },
      eq("id", workspaceId),
    );
    return {
      id,
      status: "queued",
      message:
        "Busca na fila. Os resultados serão atualizados automaticamente.",
    };
  });
  // Commit first: delivery may start immediately in another Vercel invocation.
  // A publish failure leaves a durable task; retrying this action publishes it again.
  await dispatchDiscovery(result.id);
  return result;
}

export class DiscoveryTaskBusyError extends Error {}

export async function processNextDiscoveryTask(taskId?: string) {
  const leaseToken = randomUUID();
  const task = await store.transaction(async (tx) => {
    const [task] = await tx.select("discoveryTasks", {
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
    if (!task) {
      if (taskId) {
        const [existing] = await tx.select("discoveryTasks", {
          where: eq("id", taskId),
          columns: ["status"],
        });
        if (existing?.status === "running")
          throw new DiscoveryTaskBusyError(
            "A busca ainda pertence a outro processo.",
          );
      }
      return null;
    }
    // At most one restart recovery; completed/failed tasks are never automatically repeated.
    if (task.attempts >= 2) {
      await tx.update(
        "discoveryTasks",
        {
          status: "failed",
          leaseToken: null,
          leaseUntil: null,
          lastError: "Busca interrompida duas vezes. Inicie uma nova busca.",
          updatedAt: new Date(),
        },
        eq("id", task.id),
      );
      return { ...task, exhausted: true };
    }
    await tx.update(
      "discoveryTasks",
      {
        status: "running",
        attempts: task.attempts + 1,
        leaseToken,
        leaseUntil: new Date(Date.now() + 360000),
        updatedAt: new Date(),
      },
      eq("id", task.id),
    );
    return { ...task, exhausted: false };
  });
  if (!task) {
    if (taskId) {
      const [previous] = await store.select("discoveryTasks", {where:eq("id",taskId),columns:["workspaceId","status"]});
      if (previous?.status === "completed")
        await (await import("./automatic-cycle")).continueAutomaticCycle(previous.workspaceId);
    }
    return false;
  }
  const claim = and(eq("id", task.id), eq("leaseToken", leaseToken));
  // Renew long paginated runs so a second worker never reclaims a live task.
  const heartbeat = task.exhausted
    ? null
    : setInterval(() => {
        void store
          .update(
            "discoveryTasks",
            {
              leaseUntil: new Date(Date.now() + 360000),
              updatedAt: new Date(),
            },
            claim,
          )
          .catch(() => {
            console.error(
              JSON.stringify({
                event: "discovery_lease_renewal_failed",
                taskId: task.id,
              }),
            );
          });
      }, 30000);
  heartbeat?.unref();
  let discoveryCommitted = false;
  try {
    if (task.exhausted)
      throw new RequestError(
        "Busca interrompida duas vezes. Inicie uma nova busca.",
      );
    const run = await discover(task.workspaceId, task.id, leaseToken);
    // Commit completion before enqueueing the next discovery window. Otherwise
    // uniqueness returns this running task and silently loses continuation.
    const completed = await store.update("discoveryTasks", {
      status:run.status === "failed" ? "failed" : "completed",lastError:run.errors.join(" ") || null,
      leaseToken:null,leaseUntil:null,updatedAt:new Date(),
    },claim,["id"]);
    if (!completed.length) throw new StaleDiscoveryClaimError();
    discoveryCommitted = true;
    if (run.status !== "failed") {
      const current = await (
        await import("./db")
      ).readWorkspace(task.workspaceId);
      if (
        current?.profile.confirmed &&
        current.resumes.some((r) => r.approved)
      ) {
        const { enqueueResolution } = await import("./resolution-queue");
        await enqueueResolution(task.workspaceId);
      }
      await processAutomaticApplications(task.workspaceId);
      await (await import("./automatic-cycle")).continueAutomaticCycle(task.workspaceId);
    }
  } catch (error) {
    // A publish/continuation failure must be retried without changing the
    // already completed discovery into a failed run or rediscovering its jobs.
    if (discoveryCommitted) throw error;
    if (error instanceof StaleDiscoveryClaimError) return true;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível executar a busca.";
    if (!task.exhausted) {
      const failed = await store.update(
        "discoveryTasks",
        {
          status: "failed",
          lastError: message,
          leaseToken: null,
          leaseUntil: null,
          updatedAt: new Date(),
        },
        claim,
        ["id"],
      );
      // A delayed upstream/database error can arrive after another worker has
      // recovered the task. Only the current owner may change its history.
      if (!failed.length) return true;
    }
    await mutateWorkspace(task.workspaceId, (workspace) => {
      const run = workspace.runs.find((run) => run.id === task.id);
      if (run) {
        run.status = "failed";
        run.errors.push(message);
        run.message =
          "A busca não pôde concluir. Veja os erros e tente novamente.";
      }
      notify(workspace, "A busca precisa de atenção", message);
    });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
  return true;
}

export function startDiscoveryWorker() {
  let processing = false,
    stopped = false;
  let activeTask: Promise<boolean> | null = null;
  let recovery: Promise<void> | null = null;
  const recover = () => {
    if (stopped || recovery) return;
    recovery = recoverInterruptedSends()
      .then(async () => {
        for (const workspace of await store.pendingSingleSubmissionWorkspaceIds()) {
          if (stopped) break;
          await processAutomaticApplications(workspace.id);
        }
        for (const workspace of await store.routines()) {
          if (stopped) break;
          if (!workspace.routine.enabled || workspace.routine.mode !== "automatic") continue;
          if ((await store.submissionState(workspace.id))?.next)
            await processAutomaticApplications(workspace.id);
        }
      })
      .catch(() => {
        console.error(JSON.stringify({ event: "application_recovery_failed" }));
      })
      .finally(() => {
        recovery = null;
      });
  };
  const recoveryTimer = setInterval(recover, 30000);
  recoveryTimer.unref();
  recover();
  const tick = async () => {
    if (processing || stopped) return;
    processing = true;
    try {
      activeTask = processNextDiscoveryTask();
      await activeTask;
      const { processResolutionTask } = await import("./resolution-queue");
      await processResolutionTask();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "discovery_worker_failure",
          error:
            error instanceof Error ? error.message : "Erro de banco na fila",
        }),
      );
    } finally {
      processing = false;
      activeTask = null;
    }
  };
  const timer = setInterval(() => void tick(), 1500);
  timer.unref();
  void tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    clearInterval(recoveryTimer);
    await activeTask;
    await recovery;
  };
}
