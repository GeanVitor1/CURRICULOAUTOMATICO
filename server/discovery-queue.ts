import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import { db, mutateWorkspace } from "./db";
import { discoveryTasks, workspaces } from "./schema";
import { discover, notify } from "./operations";

export async function enqueueDiscovery(workspaceId: string) {
  return db.transaction(async (tx) => {
    // The workspace lock makes the uniqueness check/queue marker atomic across API processes.
    const [row] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for("update");
    if (!row) throw new Error("Workspace não encontrado.");
    if (row.demo)
      throw new Error("A demonstração não consulta fontes externas.");
    const [pending] = await tx
      .select()
      .from(discoveryTasks)
      .where(
        and(
          eq(discoveryTasks.workspaceId, workspaceId),
          inArray(discoveryTasks.status, ["queued", "running"]),
        ),
      );
    if (pending)
      return {
        id: pending.id,
        status: pending.status,
        message: "Sua busca já está na fila. Os resultados aparecerão aqui.",
      };
    if (!row.data.sources.some((source) => source.enabled && source.discovery))
      throw new Error("Configure pelo menos uma fonte antes de pesquisar.");
    const id = randomUUID(),
      at = new Date();
    await tx
      .insert(discoveryTasks)
      .values({ id, workspaceId, status: "queued" });
    row.data.runs.unshift({
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
    await tx
      .update(workspaces)
      .set({ data: row.data, updatedAt: at })
      .where(eq(workspaces.id, workspaceId));
    return {
      id,
      status: "queued",
      message:
        "Busca na fila. Os resultados serão atualizados automaticamente.",
    };
  });
}

export async function processNextDiscoveryTask() {
  const leaseToken = randomUUID();
  const task = await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(discoveryTasks)
      .where(
        or(
          eq(discoveryTasks.status, "queued"),
          and(
            eq(discoveryTasks.status, "running"),
            lt(discoveryTasks.leaseUntil, new Date()),
          ),
        ),
      )
      .orderBy(asc(discoveryTasks.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!task) return null;
    // At most one restart recovery; completed/failed tasks are never automatically repeated.
    if (task.attempts >= 2) {
      await tx
        .update(discoveryTasks)
        .set({
          status: "failed",
          leaseToken: null,
          leaseUntil: null,
          lastError: "Busca interrompida duas vezes. Inicie uma nova busca.",
          updatedAt: new Date(),
        })
        .where(eq(discoveryTasks.id, task.id));
      return { ...task, exhausted: true };
    }
    await tx
      .update(discoveryTasks)
      .set({
        status: "running",
        attempts: task.attempts + 1,
        leaseToken,
        leaseUntil: new Date(Date.now() + 360000),
        updatedAt: new Date(),
      })
      .where(eq(discoveryTasks.id, task.id));
    return { ...task, exhausted: false };
  });
  if (!task) return false;
  const claim = and(
    eq(discoveryTasks.id, task.id),
    eq(discoveryTasks.leaseToken, leaseToken),
  );
  // Renew long paginated runs so a second worker never reclaims a live task.
  const heartbeat = task.exhausted
    ? null
    : setInterval(() => {
        void db
          .update(discoveryTasks)
          .set({
            leaseUntil: new Date(Date.now() + 360000),
            updatedAt: new Date(),
          })
          .where(claim)
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
  try {
    if (task.exhausted)
      throw new Error("Busca interrompida duas vezes. Inicie uma nova busca.");
    const run = await discover(task.workspaceId, task.id);
    await db
      .update(discoveryTasks)
      .set({
        status: run.status === "failed" ? "failed" : "completed",
        lastError: run.errors.join(" ") || null,
        leaseToken: null,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(claim);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível executar a busca.";
    if (!task.exhausted)
      await db
        .update(discoveryTasks)
        .set({
          status: "failed",
          lastError: message,
          leaseToken: null,
          leaseUntil: null,
          updatedAt: new Date(),
        })
        .where(claim);
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
  const tick = async () => {
    if (processing || stopped) return;
    processing = true;
    try {
      activeTask = processNextDiscoveryTask();
      await activeTask;
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
    await activeTask;
  };
}
