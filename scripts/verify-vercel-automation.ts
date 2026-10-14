import { randomUUID } from "node:crypto";
import { resumePdf } from "../tests/pdf-fixture";

// Only a disposable synthetic account. This never selects automatic sending.
const origin = "https://curriculoautomatico.vercel.app";
const email = `automation-qa-${randomUUID()}@example.test`;
const password = `Automation-QA-${randomUUID()}`;
let cookie = "",
  registered = false;
const request = (path: string, options: RequestInit = {}) =>
  fetch(origin + path, {
    ...options,
    headers: {
      Origin: origin,
      "X-Orbita-Request": "1",
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(60000),
  });
const json = async (path: string, method: string, body: unknown) => {
  const response = await request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(`${path} returned ${response.status}: ${result.error}`);
  return result;
};
try {
  const register = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Verificação fictícia de automação",
      email,
      password,
    }),
  });
  if (!register.ok) throw new Error(`Registration returned ${register.status}`);
  cookie =
    register.headers
      .getSetCookie()
      .find((value) => value.startsWith("orbita_session="))
      ?.split(";")[0] || "";
  registered = true;
  if (!cookie || (await (await request("/api/auth/me")).json()).email !== email)
    throw new Error("Synthetic identity mismatch");
  const pdf = new FormData();
  pdf.set(
    "file",
    new Blob([new Uint8Array(resumePdf())], { type: "application/pdf" }),
    "synthetic-resume.pdf",
  );
  const uploaded = await request("/api/resumes", { method: "POST", body: pdf });
  if (!uploaded.ok) throw new Error(`PDF upload returned ${uploaded.status}`);
  const workspace = await (await request("/api/workspace")).json();
  if (
    workspace.resumes[0].storedFile ||
    workspace.resumes[0].originalFileAvailable !== true
  )
    throw new Error(
      "Original file availability or private archive serialization failed",
    );
  const original = await request(
    `/api/resumes/${workspace.resumes[0].id}/download`,
  );
  const originalBytes = Buffer.from(await original.arrayBuffer());
  if (!original.ok || !originalBytes.equals(resumePdf()))
    throw new Error("Original PDF download was not preserved");
  console.log(
    JSON.stringify({
      originalPdfDownload: original.status,
      originalBytesPreserved: true,
      privateArchiveHidden: true,
    }),
  );
  if (
    !workspace.infrastructure.worker ||
    !workspace.infrastructure.scheduleWindow
  )
    throw new Error("Vercel worker or daily schedule not available");
  await json("/api/interview", "PUT", {
    step: 5,
    complete: true,
    start: "prepare",
    answers: {
      resumeId: workspace.resumes[0].id,
      titles: ["Desenvolvedor .NET"],
      modalities: ["Remoto"],
      city: "",
      sameCityOnly: false,
      salaryMin: 0,
      salaryMax: 0,
      includeUnknownSalary: true,
      ageDays: 365,
      contracts: [],
      sites: ["gupy"],
      dailyLimit: 5,
    },
  });
  const initial = await (await request("/api/workspace")).json();
  const taskId = initial.runs[0]?.id;
  if (
    !taskId ||
    !initial.routine.enabled ||
    initial.routine.mode !== "approval"
  )
    throw new Error("Interview failed to queue the preparation routine");
  console.log(
    JSON.stringify({
      preferencesSaved: true,
      searchQueued: true,
      scheduleWindow: initial.infrastructure.scheduleWindow,
    }),
  );
  // Stop future daily runs while allowing the already queued discovery to finish.
  await json("/api/routine", "PUT", { ...initial.routine, enabled: false });
  let completed = false;
  for (let elapsed = 0; elapsed < 285000; elapsed += 3000) {
    const current = await (await request("/api/workspace")).json();
    const run = current.runs.find((item: any) => item.id === taskId);
    if (current.applications.some((item: any) => item.submittedAt))
      throw new Error("Unexpected submission in discovery verification");
    if (run && !["queued", "running"].includes(run.status)) {
      console.log(
        JSON.stringify({
          workerFinished: true,
          status: run.status,
          discovered: run.discovered,
          sourceErrors: run.errors,
          applicationsSent: 0,
        }),
      );
      if (["failed", "interrupted"].includes(run.status))
        throw new Error("The search did not complete successfully");
      completed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  if (!completed)
    throw new Error("Discovery was not consumed within its execution window");
  const cron = await request("/api/daily-routine");
  if (cron.status !== 401) throw new Error("Daily schedule is not protected");
  console.log(JSON.stringify({ publicCronRejected: cron.status }));
} finally {
  if (registered) {
    const cleanup = await json("/api/account", "DELETE", { password });
    console.log(JSON.stringify({ syntheticAccountCleanup: !!cleanup.ok }));
  }
}
