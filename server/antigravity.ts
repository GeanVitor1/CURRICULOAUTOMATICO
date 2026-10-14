import { Sandbox } from "@vercel/sandbox";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RequestError } from "./errors";
import { discoverySignal } from "./discovery-budget";
import {
  antigravitySettings,
  authorizationUrl,
  parseAntigravitySearch,
  antigravityJobsSchema,
  selectSearchModel,
} from "./antigravity-protocol";

const name = () =>
  process.env.ANTIGRAVITY_SANDBOX_NAME || "empregatos-antigravity";
const home = "/vercel/sandbox/antigravity-home";
const control = "/vercel/sandbox/antigravity-control.json";
const wrapper = "/vercel/sandbox/run-antigravity.sh";
const loginHelper = "/vercel/sandbox/login-antigravity.py";
type Connection = {
  connected: boolean;
  commandId?: string;
  attempt?: string;
  expiresAt?: number;
  url?: string;
  busyUntil?: number;
  model?: string;
};

export function antigravityAvailable(userId?: string) {
  return (
    !!userId &&
    process.env.ANTIGRAVITY_ENABLED === "true" &&
    userId === process.env.ANTIGRAVITY_OWNER_ID
  );
}
function requireOwner(userId: string) {
  if (!antigravityAvailable(userId))
    throw new RequestError("Antigravity não está disponível para esta conta.");
}
async function sandbox() {
  return Sandbox.get({ name: name() });
}
async function readConnection(s: Sandbox): Promise<Connection> {
  const bytes = await s.readFileToBuffer({ path: control });
  return bytes ? JSON.parse(bytes.toString("utf8")) : { connected: false };
}
async function writeConnection(s: Sandbox, value: Connection) {
  await s.writeFiles([
    { path: control, content: Buffer.from(JSON.stringify(value)), mode: 0o600 },
  ]);
}

const runScript = `#!/bin/bash
set -euo pipefail
umask 077
export HOME=${home}
unset GEMINI_API_KEY GOOGLE_API_KEY GOOGLE_GEMINI_BASE_URL VERCEL_OIDC_TOKEN DATABASE_URL ENCRYPTION_KEY
mkdir -p "$HOME/.gemini/antigravity-cli" /vercel/sandbox/antigravity-work
if [ ! -f "$HOME/keyring-password" ]; then
  head -c 32 /dev/urandom | base64 > "$HOME/keyring-password"
fi
cd /vercel/sandbox/antigravity-work
exec flock -n -o /vercel/sandbox/antigravity.lock dbus-run-session -- bash -c '
  gnome-keyring-daemon --unlock --components=secrets < "$HOME/keyring-password" >/dev/null 2>&1
  exec /vercel/sandbox/bin/agy "$@"
' -- "$@"
`;

// The CLI checks stdin for a real terminal before starting OAuth. Keep its
// stdin in a PTY, with echo disabled; forward diagnostics and response separately.
const loginScript = `import os, pty, selectors, signal, subprocess, sys, termios
master, slave = pty.openpty()
attrs = termios.tcgetattr(slave)
attrs[3] &= ~termios.ECHO
termios.tcsetattr(slave, termios.TCSANOW, attrs)
child = subprocess.Popen(["${wrapper}", "-p", "Responda apenas OK.", "--output-format", "json", "--print-timeout", "20s"], stdin=slave, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
os.close(slave)
def terminate(*args):
    try: os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError: pass
    raise SystemExit(1)
signal.signal(signal.SIGTERM, terminate)
selector = selectors.DefaultSelector()
selector.register(sys.stdin.buffer, selectors.EVENT_READ, master)
selector.register(child.stdout, selectors.EVENT_READ, 1)
selector.register(child.stderr, selectors.EVENT_READ, 2)
while selector.get_map():
    for key, _ in selector.select(timeout=1):
        data = os.read(key.fd, 65536)
        if data: os.write(key.data, data)
        else: selector.unregister(key.fileobj)
    if child.poll() is not None:
        try: selector.unregister(sys.stdin.buffer)
        except KeyError: pass
os.close(master)
sys.exit(child.wait())
`;

export async function antigravityStatus(userId: string) {
  if (!antigravityAvailable(userId))
    return { available: false, connected: false };
  const s = await sandbox();
  const connection = await readConnection(s);
  const pending =
    connection.commandId && (connection.expiresAt || 0) > Date.now();
  // A read must not stop a search/login in another Function. The sandbox has
  // a bounded session timeout; actual jobs stop it explicitly on completion.
  return {
    available: true,
    connected: connection.connected,
    pending: !!pending,
    expiresAt: pending ? connection.expiresAt : undefined,
  };
}

export async function startAntigravityLogin(userId: string) {
  requireOwner(userId);
  const s = await sandbox();
  const previous = await readConnection(s);
  if ((previous.busyUntil || 0) > Date.now())
    throw new RequestError(
      "Uma busca está usando o Antigravity. Aguarde ela terminar antes de reconectar.",
    );
  if (previous.commandId) {
    await s
      .getCommand(previous.commandId)
      .then((command) => command.kill())
      .catch(() => undefined);
  }
  await s.runCommand({
    cmd: "mkdir",
    args: [
      "-p",
      `${home}/.gemini/antigravity-cli`,
      "/vercel/sandbox/antigravity-work",
    ],
  });
  await s.writeFiles([
    { path: wrapper, content: Buffer.from(runScript), mode: 0o700 },
    { path: loginHelper, content: Buffer.from(loginScript), mode: 0o600 },
    {
      path: `${home}/.gemini/antigravity-cli/settings.json`,
      content: Buffer.from(JSON.stringify(antigravitySettings)),
      mode: 0o600,
    },
  ]);
  const command = await s.runCommand({
    cmd: "python3",
    args: [loginHelper],
    stdin: true,
    detached: true,
  });
  const attempt = randomUUID();
  let output = "";
  try {
    for await (const log of command.logs({
      signal: AbortSignal.timeout(18000),
    })) {
      output += log.data;
      const url = authorizationUrl(output);
      if (url) {
        const expiresAt = Date.now() + 55000;
        await writeConnection(s, {
          connected: false,
          commandId: command.cmdId,
          attempt,
          expiresAt,
          url,
        });
        return { attempt, url, expiresAt };
      }
      if (output.length > 100000) break;
    }
    const completed = await command.wait({ signal: AbortSignal.timeout(5000) });
    if (
      completed.exitCode === 0 &&
      JSON.parse(await completed.stdout()).status === "SUCCESS"
    ) {
      await writeConnection(s, { connected: true });
      await s.stop();
      return { connected: true };
    }
  } catch {
    /* Never return raw CLI diagnostics or credentials to the browser. */
  }
  await command.kill().catch(() => undefined);
  await writeConnection(s, { connected: false });
  await s.stop();
  throw new RequestError(
    "Não conseguimos iniciar o login Google. Tente conectar novamente.",
  );
}

export async function finishAntigravityLogin(userId: string, input: unknown) {
  requireOwner(userId);
  const body = z
    .object({
      attempt: z.string().uuid(),
      code: z
        .string()
        .trim()
        .min(6)
        .max(2048)
        .regex(/^[a-zA-Z0-9/_.~+=-]+$/),
    })
    .parse(input);
  const s = await sandbox();
  const connection = await readConnection(s);
  if (
    !connection.commandId ||
    connection.attempt !== body.attempt ||
    (connection.expiresAt || 0) < Date.now()
  ) {
    await s.stop();
    throw new RequestError(
      "O login expirou. Clique em conectar para gerar outro link.",
    );
  }
  const command = await s.getCommand(connection.commandId);
  try {
    await command.writeStdin(body.code + "\n");
    await command.closeStdin();
    const result = await command.wait({ signal: AbortSignal.timeout(40000) });
    const parsed = JSON.parse(await result.stdout());
    if (result.exitCode !== 0 || parsed.status !== "SUCCESS")
      throw new Error("LOGIN_FAILED");
    await writeConnection(s, { connected: true });
    return { connected: true };
  } catch {
    await command.kill().catch(() => undefined);
    await writeConnection(s, { connected: false });
    throw new RequestError(
      "A conexão não foi confirmada. Confira a conta Google e tente novamente.",
    );
  } finally {
    await s.stop();
  }
}

export async function disconnectAntigravity(userId: string) {
  requireOwner(userId);
  const s = await sandbox();
  const connection = await readConnection(s);
  if ((connection.busyUntil || 0) > Date.now())
    throw new RequestError("Aguarde a busca terminar antes de desconectar.");
  if (connection.commandId)
    await s
      .getCommand(connection.commandId)
      .then((command) => command.kill())
      .catch(() => undefined);
  // These constant paths are entirely inside this app's sandbox. Retaining only
  // one automatic snapshot removes the previous snapshot containing the login.
  await s.runCommand({
    cmd: "python3",
    args: [
      "-c",
      "import shutil; shutil.rmtree('/vercel/sandbox/antigravity-home', ignore_errors=True)",
    ],
  });
  await writeConnection(s, { connected: false });
  await s.stop();
  return { connected: false };
}

export async function searchAntigravity(userId: string, prompt: string) {
  requireOwner(userId);
  const s = await sandbox();
  const connection = await readConnection(s);
  if (!connection.connected) {
    if (!connection.commandId || (connection.expiresAt || 0) < Date.now())
      await s.stop();
    throw new RequestError(
      "Conecte sua conta Google em Automação → Antigravity na nuvem para usar a busca.",
    );
  }
  const signal = discoverySignal(65000);
  let model = process.env.ANTIGRAVITY_SEARCH_MODEL || connection.model;
  if (!model) {
    const catalog = await s.runCommand({ cmd: wrapper, args: ["models"] });
    if (catalog.exitCode === 0)
      model = selectSearchModel(await catalog.stdout());
  }
  await writeConnection(s, { ...connection, busyUntil: Date.now() + 75000 });
  let command;
  let phase = "execution";
  try {
    command = await s.runCommand({
      cmd: wrapper,
      args: [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--disable-slash-commands",
        ...(model ? ["--model", model] : []),
        "--effort",
        "low",
        "--json-schema",
        JSON.stringify(z.toJSONSchema(antigravityJobsSchema)),
        "--print-timeout",
        "55s",
      ],
      detached: true,
    });
    const result = await command.wait({ signal });
    if (result.exitCode !== 0) throw new Error("CLI_FAILED");
    const output = await result.stdout({ signal });
    if (output.length > 2_000_000) throw new Error("CLI_OUTPUT_TOO_LARGE");
    phase = "results";
    return parseAntigravitySearch(output);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "antigravity_search_failed",
        phase,
        type: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    await command?.kill().catch(() => undefined);
    throw new RequestError(
      "Antigravity não concluiu a busca. Confira a conexão e a cota da sua conta Google.",
    );
  } finally {
    await writeConnection(s, { connected: true, model });
    await s.stop();
  }
}
