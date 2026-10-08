import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { VERIFIED_SOURCES } from "../server/source-registry";

// A dedicated evidence database; never uses the application/user production database.
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;
process.env.DATA_DIR = resolve("artifacts/persistence-test-db");
const { db, closeDb, readWorkspace } = await import("../server/db");
const { users, workspaces } = await import("../server/schema");
const { createWorkspace } = await import("../server/workspace");
const { discover } = await import("../server/operations");
const id = "connector-validation:live";
await mkdir("artifacts", { recursive: true });
try {
  if (process.argv[2] === "capture") {
    const saved = await readWorkspace(id);
    if (!saved)
      throw new Error(
        "Crie primeiro a evidência com: npx tsx scripts/verify-persistence.ts seed",
      );
    await writeFile(
      "artifacts/persistence-before.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          stage: "capture-current-persisted-state",
          jobs: saved.jobs.length,
          runs: saved.runs,
          notices: saved.notices,
          firstJob: saved.jobs[0] && {
            id: saved.jobs[0].id,
            title: saved.jobs[0].title,
            url: saved.jobs[0].url,
            origin: saved.jobs[0].origins[0],
          },
          applications: saved.applications.length,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        stage: "capture-current-persisted-state",
        jobs: saved.jobs.length,
        externalRequests: 0,
      }),
    );
  } else if (process.argv[2] === "seed") {
    await db
      .insert(users)
      .values({
        id: "connector-validation",
        email: "validation@example.test",
        name: "Verificação local",
        password: "disabled-no-login",
      })
      .onConflictDoNothing();
    const workspace = createWorkspace(
      "Verificação local",
      "validation@example.test",
      false,
    );
    workspace.filters.titles = ["Auxiliar administrativo"];
    workspace.filters.modalities = ["Presencial"];
    workspace.sources = VERIFIED_SOURCES.filter((s) =>
      ["lalamove", "khanacademy"].includes(s.board),
    ).map((s) => ({
      ...s,
      id: s.board,
      enabled: true,
      discovery: true,
      application: false,
      status: "Aguardando consulta",
    }));
    await db
      .insert(workspaces)
      .values({
        id,
        userId: "connector-validation",
        demo: false,
        data: workspace,
      })
      .onConflictDoNothing();
    const run = await discover(id);
    if (run.status === "failed") throw new Error(run.errors.join(" "));
    const saved = (await readWorkspace(id))!;
    const evidence = {
      checkedAt: new Date().toISOString(),
      stage: "seed",
      jobs: saved.jobs.length,
      runs: saved.runs,
      notices: saved.notices,
      sourceHealth: saved.sources.map((s) => ({
        company: s.company,
        status: s.status,
        lastError: s.lastError,
      })),
      firstJob: saved.jobs[0] && {
        id: saved.jobs[0].id,
        title: saved.jobs[0].title,
        url: saved.jobs[0].url,
        origin: saved.jobs[0].origins[0],
      },
      applications: saved.applications.length,
    };
    await writeFile(
      "artifacts/persistence-before.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(
      JSON.stringify({
        stage: "seed",
        jobs: evidence.jobs,
        run: run.status,
        applications: evidence.applications,
      }),
    );
  } else if (process.argv[2] === "verify") {
    const before = JSON.parse(
      await readFile("artifacts/persistence-before.json", "utf8"),
    );
    const saved = (await readWorkspace(id))!;
    if (
      !saved ||
      saved.jobs.length !== before.jobs ||
      saved.jobs[0]?.id !== before.firstJob?.id ||
      JSON.stringify(saved.runs) !== JSON.stringify(before.runs) ||
      JSON.stringify(saved.notices) !== JSON.stringify(before.notices)
    )
      throw new Error("Persistência divergente após reiniciar o processo.");
    const evidence = {
      checkedAt: new Date().toISOString(),
      stage: "verify-after-process-restart",
      jobs: saved.jobs.length,
      runsRetained: true,
      noticesRetained: true,
      sourceOriginsRetained:
        JSON.stringify(saved.jobs[0]?.origins[0]) ===
        JSON.stringify(before.firstJob?.origin),
      applications: saved.applications.length,
      externalRequests: 0,
    };
    await writeFile(
      "artifacts/persistence-after.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } else if (process.argv[2] === "queue-seed") {
    const { enqueueDiscovery } = await import("../server/discovery-queue");
    const task = await enqueueDiscovery(id);
    await writeFile(
      "artifacts/queue-before.json",
      JSON.stringify({ ...task, checkedAt: new Date().toISOString() }, null, 2),
    );
    console.log(JSON.stringify(task));
  } else if (process.argv[2] === "queue-verify") {
    const { processNextDiscoveryTask } =
      await import("../server/discovery-queue");
    const before = JSON.parse(
      await readFile("artifacts/queue-before.json", "utf8"),
    );
    const initial = (await readWorkspace(id))!;
    if (
      !initial.runs.some(
        (run) => run.id === before.id && run.status === "queued",
      )
    )
      throw new Error(
        "A tarefa enfileirada não foi preservada após reiniciar o processo.",
      );
    await processNextDiscoveryTask();
    const saved = (await readWorkspace(id))!;
    const run = saved.runs.find((run) => run.id === before.id);
    if (!run || !["completed", "partial"].includes(run.status))
      throw new Error("A tarefa persistida não foi concluída.");
    const evidence = {
      checkedAt: new Date().toISOString(),
      taskId: before.id,
      queuedSurvivedRestart: true,
      status: run.status,
      jobs: saved.jobs.length,
      applications: saved.applications.length,
    };
    await writeFile(
      "artifacts/queue-after.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } else
    throw new Error(
      "Use seed, verify, queue-seed ou queue-verify em processos separados.",
    );
} finally {
  await closeDb();
}
