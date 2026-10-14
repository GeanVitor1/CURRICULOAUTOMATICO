import { randomUUID } from "node:crypto";
import { resumePdf } from "../tests/pdf-fixture";

// Uses only a disposable synthetic account and a synthetic PDF. Credentials
// stay in memory, and cleanup can target only the session created by this test.
const origin = "https://curriculoautomatico.vercel.app";
const email = `pdf-qa-${randomUUID()}@example.test`;
const password = `Pdf-QA-${randomUUID()}`;
let cookie = "";
let registered = false;
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
try {
  const register = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Verificação fictícia de PDF",
      email,
      password,
    }),
  });
  if (register.status !== 200)
    throw new Error(`Synthetic registration returned ${register.status}`);
  cookie =
    register.headers
      .getSetCookie()
      .find((value) => value.startsWith("orbita_session="))
      ?.split(";")[0] || "";
  if (!cookie) throw new Error("No synthetic session was returned");
  registered = true;
  const me = await request("/api/auth/me");
  const identity = await me.json();
  if (me.status !== 200 || identity.email !== email)
    throw new Error("Synthetic identity check failed");
  const form = new FormData();
  form.set(
    "file",
    new Blob([new Uint8Array(resumePdf())], { type: "application/pdf" }),
    "synthetic-resume.pdf",
  );
  const upload = await request("/api/resumes", { method: "POST", body: form });
  if (upload.status !== 200)
    throw new Error(`PDF upload returned ${upload.status}`);
  const workspace = await request("/api/workspace");
  const saved = (await workspace.json()).resumes?.[0];
  if (
    workspace.status !== 200 ||
    !saved?.text?.includes("Verified projects") ||
    !saved?.skills?.includes("SQL Server") ||
    !saved?.review?.sections?.length
  )
    throw new Error("Saved extraction or diagnosis was incomplete");
  console.log(
    JSON.stringify({
      pdfUpload: upload.status,
      textExtracted: true,
      skillsVerified: true,
      reviewSaved: true,
    }),
  );
} finally {
  if (registered) {
    const cleanup = await request("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    console.log(JSON.stringify({ syntheticAccountCleanup: cleanup.status }));
    if (cleanup.status !== 200)
      throw new Error(`Synthetic cleanup returned ${cleanup.status}`);
  }
}
