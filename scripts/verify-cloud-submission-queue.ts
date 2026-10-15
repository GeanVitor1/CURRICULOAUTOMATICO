import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { QueueClient } from "@vercel/queue";
dotenv.config({ path: ".env.production.local", quiet: true });
process.env.VERCEL_OIDC_TOKEN = dotenv.parse(
  await readFile(".env.antigravity.local"),
).VERCEL_OIDC_TOKEN;
const { mutateWorkspace, readWorkspace, closeDb } =
  await import("../server/db");
const origin = "https://curriculoautomatico.vercel.app";
const deploymentId = process.argv[2];
if (!deploymentId?.startsWith("dpl_"))
  throw new Error("Pass the deployed production ID explicitly");
const client = new QueueClient({ deploymentId, region: "iad1" });
const password = `Queue-QA-${randomUUID()}`;
let cookie = "",
  registered = false;
const request = (path: string, method = "GET", body?: unknown) =>
  fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      "X-Orbita-Request": "1",
      Cookie: cookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
try {
  const registration = await request("/api/auth/register", "POST", {
    name: "Fila QA fictícia",
    email: `queue-qa-${randomUUID()}@example.test`,
    password,
  });
  if (!registration.ok) throw new Error("Synthetic registration failed");
  const user = await registration.json();
  cookie =
    registration.headers
      .getSetCookie()
      .find((c) => c.startsWith("orbita_session="))
      ?.split(";")[0] || "";
  registered = true;
  const id = `${user.id}:live`;
  // No portal connection, resume, job, or submission endpoint: verifies queue execution
  // and chaining by requiring the worker to record the missing-connection blocker.
  const applicationIds = [randomUUID(), randomUUID()];
  await mutateWorkspace(id, (w) => {
    w.routine.enabled = true;
    w.routine.mode = "automatic";
    w.applications = applicationIds.map((applicationId) => ({
      id: applicationId,
      jobId: "synthetic-no-job",
      resumeId: "synthetic-no-resume",
      status: "Aguardando aprovação",
      mode: "automatic",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      draft: "Synthetic queue verification",
      note: "",
      receipt: null,
      submittedAt: null,
      history: [],
    }));
  });
  await client.send(
    "empregatos-submissions",
    { workspaceId: id, applicationId: applicationIds[0] },
    { idempotencyKey: `qa:${applicationIds[0]}` },
  );
  let finished = false;
  for (let elapsed = 0; elapsed < 120000; elapsed += 2000) {
    const w = await readWorkspace(id);
    if (w?.applications.some((a) => a.submittedAt || a.receipt))
      throw new Error("Unexpected synthetic submission");
    if (
      w?.applications.length === 2 &&
      w.applications.every(
        (a) =>
          a.status === "Requer ação manual" &&
          a.history.some((e) => /integração|conecte/i.test(e.message)),
      )
    ) {
      finished = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!finished)
    throw new Error("Submission queue did not finish both controlled tasks");
  console.log(
    JSON.stringify({
      productionSubmissionQueueConsumed: true,
      nextApplicationDispatched: true,
      missingConnectionReported: true,
      applicationsSubmitted: 0,
    }),
  );
} finally {
  if (registered) {
    const cleanup = await request("/api/account", "DELETE", { password });
    if (!cleanup.ok) throw new Error("Synthetic account cleanup failed");
  }
  await closeDb();
}
