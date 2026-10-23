import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Firestore } from "@google-cloud/firestore";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { firestoreStore } from "../server/storage-firestore";
import { and, eq } from "../server/storage-types";
import { clearApplicationHistory } from "../server/clear-application-history";

// Uses the operator's existing Firebase CLI credentials, never a browser session.
// Dry run by default. Restricts all changes to exactly one explicitly named owner.
const email = process.argv.find((arg) => arg.startsWith("--email="))?.slice(8);
if (!email) throw new Error("Informe --email=conta e opcionalmente --apply.");
const config = JSON.parse(
  await readFile(
    join(homedir(), ".config/configstore/firebase-tools.json"),
    "utf8",
  ),
);
if (!config.tokens?.access_token)
  throw new Error("Entre no Firebase CLI primeiro.");
const client = new OAuth2Client();
client.setCredentials({ access_token: config.tokens.access_token });
const projectId = "curriculoautomatico-a15fa";
process.env.FIREBASE_PROJECT_ID = projectId;
const database = new Firestore({
  projectId,
  ignoreUndefinedProperties: true,
  auth: new GoogleAuth({ authClient: client, projectId }),
});
const store = firestoreStore(database);
try {
  const owners = await store.select("users", { where: eq("email", email) });
  if (owners.length !== 1)
    throw new Error("Não foi encontrado um único titular.");
  const owner = owners[0];
  const [intelligence] = await store.select("aiSettings", {
    where: eq("userId", owner.id),
    columns: ["provider", "enabled", "consent"],
  });
  console.log(JSON.stringify({ intelligence: intelligence || null }));
  const rows = await store.select("workspaces", {
    where: and(eq("userId", owner.id), eq("demo", false)),
  });
  if (rows.length !== 1 || rows[0].data.profile.email !== email)
    throw new Error("Conta ou espaço ambíguo.");
  const id = rows[0].id;
  console.log(
    JSON.stringify({
      mode: process.argv.includes("--apply") ? "apply" : "inspect",
      jobs: rows[0].data.jobs.length,
      applications: rows[0].data.applications.length,
      sending: rows[0].data.applications.filter((a) => a.status === "Enviando")
        .length,
    }),
  );
  if (process.argv.includes("--apply")) {
    const removed = await store.transaction(async (tx) => {
      const [row] = await tx.select("workspaces", {
        where: eq("id", id),
        lock: true,
      });
      if (!row || row.userId !== owner.id) throw new Error("Titular mudou.");
      // All transaction reads must precede writes in Firestore.
      const discovery = await tx.select("discoveryTasks", {
        where: eq("workspaceId", id),
      });
      const resolution = await tx.select("resolutionTasks", {
        where: eq("workspaceId", id),
      });
      const result = clearApplicationHistory(row.data);
      row.data.profile.answerPolicy = {
        enabled: true,
        missing: "no",
        confirmedAt: new Date().toISOString(),
      };
      for (const task of discovery)
        await tx.delete("discoveryTasks", eq("id", task.id));
      for (const task of resolution)
        await tx.delete("resolutionTasks", eq("id", task.id));
      await tx.update(
        "workspaces",
        { data: row.data, updatedAt: new Date() },
        eq("id", id),
      );
      return result;
    });
    const [after] = await store.select("workspaces", { where: eq("id", id) });
    if (after.data.jobs.length || after.data.applications.length)
      throw new Error("A limpeza não foi confirmada.");
    console.log(
      JSON.stringify({
        removed,
        remaining: {
          jobs: after.data.jobs.length,
          applications: after.data.applications.length,
        },
        automaticAnswers: after.data.profile.answerPolicy?.enabled,
      }),
    );
  }
} finally {
  await store.close();
}
