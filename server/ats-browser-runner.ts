import { readFile, writeFile, rm } from "node:fs/promises";
import { launchProtectedBrowser } from "./browser-egress";
import { executeAtsApplication, type AtsApplication } from "./ats-application";
import { atsHostResolverRules, guardAtsPage } from "./ats-network";
import { assertSecureNode } from "./runtime-security";
assertSecureNode();
const root = "/vercel/sandbox/portal-runtime/ats-execution";
const input: AtsApplication = JSON.parse(
  await readFile(`${root}/input.json`, "utf8"),
);
const browser = await launchProtectedBrowser({
  headless: true,
  args: [
    `--host-resolver-rules=${await atsHostResolverRules(input.destination.url)}`,
  ],
});
try {
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
  const page = await context.newPage();
  await guardAtsPage(context, input.destination.url);
  await writeFile(`${root}/form-execution-started`, "1", {mode:0o600});
  const result = await executeAtsApplication(page, input);
  await writeFile(`${root}/result.json`, JSON.stringify(result), {
    mode: 0o600,
  });
} finally {
  await browser.close();
  await rm(`${root}/input.json`, { force: true });
}
