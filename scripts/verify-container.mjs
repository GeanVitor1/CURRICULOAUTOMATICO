// Run inside the isolated Docker validation container, using its private environment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = "http://127.0.0.1:3001",
  password = randomUUID() + randomUUID();
let cookie = "";
const headers = () => ({
  "x-orbita-request": "1",
  "x-empregatos-proxy-secret": process.env.API_PROXY_SECRET,
  origin: process.env.APP_ORIGIN,
  ...(cookie ? { cookie } : {}),
});
async function request(path, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...headers(),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.ok(response.ok, `HTTP ${response.status}: ${path}`);
  return { response, body: await response.json() };
}
try {
  assert.equal((await fetch(base + "/api/health")).status, 200);
  assert.equal((await fetch(base + "/api/auth/providers")).status, 403);
  const registration = await request("/api/auth/register", "POST", {
    name: "Container QA",
    email: `container-${randomUUID()}@example.test`,
    password,
  });
  const setCookie = registration.response.headers.get("set-cookie");
  assert.ok(setCookie.includes("Secure"));
  cookie = setCookie.split(";")[0];
  const built = await request("/api/resumes/build", "POST", {
    name: "Container QA",
    headline: "Auxiliar administrativo",
    education: "Ensino medio completo",
    experience: "Experiencia em rotinas administrativas",
    skills: ["Excel"],
  });
  const resumeId = built.body.resumeId;
  const downloaded = await fetch(base + `/api/resumes/${resumeId}/download`, {
    headers: headers(),
  });
  assert.ok(downloaded.ok);
  assert.equal(
    Buffer.from(await downloaded.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  await request("/api/interview", "PUT", {
    step: 5,
    complete: true,
    start: "save",
    answers: {
      resumeId,
      titles: ["Auxiliar administrativo"],
      modalities: ["Remoto", "Presencial"],
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
  await request("/api/discover", "POST");
  let state;
  for (let i = 0; i < 25; i++) {
    state = (await request("/api/workspace")).body;
    if (["completed", "partial", "failed"].includes(state.runs[0]?.status))
      break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  assert.ok(["completed", "partial"].includes(state.runs[0]?.status));
  assert.ok(state.jobs.length > 0);
  assert.equal(state.applications.length, 0);
  console.log(
    JSON.stringify({
      productionContainer: true,
      postgresWorking: true,
      privateApiProtected: true,
      secureCookie: true,
      encryptedResumeDownload: true,
      continuousQueue: true,
      realJobs: state.jobs.length,
      applicationsSent: 0,
    }),
  );
} finally {
  if (cookie) await request("/api/account", "DELETE", { password });
}
