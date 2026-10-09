import { RequestError } from "./errors";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  open,
  stat,
} from "node:fs/promises";
import { resolve } from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import {
  editableLoginFields,
  loginInputs,
  readLoginField,
  submitLoginForm,
} from "./portal-login-fields";
import { candidatePortals } from "../shared/portals";
import { dataDir } from "./db";
import { encryptSecret, decryptSecret } from "./intelligence";
import {
  authenticated,
  applyOnPage,
  portalRules,
  type PortalApplication,
  type PortalResult,
} from "./portal-application";
import {
  portalLogin,
  protectBrowser,
  type CandidatePortal,
} from "./portal-browser-policy";
import { browserAuthorized } from "./provider-capabilities";

type SavedConnection = {
  connectedAt: string;
  verifiedAt?: string;
  profileResumeId: string | null;
  state: Awaited<ReturnType<BrowserContext["storageState"]>>;
};
type LoginSession = {
  context: BrowserContext;
  page: Page;
  expires: number;
  release: () => Promise<void>;
  busy: boolean;
  closing?: Promise<void>;
};
const directory = resolve(dataDir, "portal-sessions");
const logins = new Map<string, LoginSession>();
let openingLogins = 0;
let browser: Promise<Browser> | undefined;
const key = (userId: string, portal: CandidatePortal) =>
  createHash("sha256").update(`${userId}:${portal}`).digest("hex");
const path = (userId: string, portal: CandidatePortal) =>
  resolve(directory, key(userId, portal) + ".enc");
export const nativeConnectionsEnabled = () =>
  process.env.PORTAL_CONNECTIONS_ENABLED !== "false";
async function getBrowser() {
  if (!nativeConnectionsEnabled())
    throw new RequestError("As conexões estão desativadas neste servidor.");
  if (!browser) {
    browser = chromium.launch({
      headless: true,
      chromiumSandbox: process.platform === "linux",
      timeout: 20000,
    });
    browser
      .then((b) =>
        b.on("disconnected", () => {
          browser = undefined;
        }),
      )
      .catch(() => {
        browser = undefined;
      });
  }
  return browser.catch(() => {
    throw new RequestError(
      "O navegador de candidaturas não está instalado. O administrador precisa executar npx playwright install --with-deps chromium no servidor.",
    );
  });
}
async function load(
  userId: string,
  portal: CandidatePortal,
): Promise<SavedConnection | null> {
  try {
    return JSON.parse(
      decryptSecret(await readFile(path(userId, portal), "utf8")),
    );
  } catch {
    return null;
  }
}
async function save(
  userId: string,
  portal: CandidatePortal,
  value: SavedConnection,
) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = path(userId, portal),
    temporary = destination + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, encryptSecret(JSON.stringify(value)), {
      mode: 0o600,
    });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
async function lease(userId: string, portal: CandidatePortal) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path(userId, portal) + ".lock";
  // A crashed process leaves a lease. Interactive logins expire at 15 minutes;
  // application attempts have a 2-minute ceiling. Never steal a fresh lease.
  if (
    await stat(target)
      .then((s) => Date.now() - s.mtimeMs > 20 * 60 * 1000)
      .catch(() => false)
  )
    await rm(target, { force: true });
  const file = await open(target, "wx", 0o600).catch(() => {
    throw new RequestError(
      "Este site já está aberto em uma conexão ou candidatura. Aguarde a conclusão.",
    );
  });
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await file.close();
    await rm(target, { force: true });
  };
}
async function context(portal: CandidatePortal, saved: SavedConnection | null) {
  const b = await getBrowser();
  const c = await b.newContext({
    viewport: { width: 1024, height: 720 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: saved?.state,
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  c.setDefaultTimeout(8000);
  await protectBrowser(c, portal);
  return c;
}
export async function connectionStatuses(userId: string) {
  return Promise.all(
    candidatePortals.map(async (portal) => {
      const saved = await load(userId, portal);
      const verifiedAt = saved?.verifiedAt || saved?.connectedAt;
      const expired =
        !!saved &&
        (!verifiedAt ||
          Date.now() - Date.parse(verifiedAt) > 12 * 60 * 60 * 1000 ||
          (saved.state.cookies.length > 0 &&
            saved.state.cookies.every(
              (cookie) =>
                cookie.expires > 0 && cookie.expires * 1000 <= Date.now(),
            )));
      const allowed = browserAuthorized(portal);
      return {
        id: portal,
        connected: !!saved && allowed && !expired,
        sessionState: saved
          ? expired
            ? "expired"
            : allowed
              ? "verified"
              : "unavailable"
          : "disconnected",
        sessionSaved: !!saved,
        verifiedAt: verifiedAt || null,
        connectedAt: saved?.connectedAt || null,
        profileResumeId: saved?.profileResumeId || null,
        connectable: allowed,
      };
    }),
  );
}
export async function connectedPortals(userId: string) {
  return (await connectionStatuses(userId))
    .filter((s) => s.connected)
    .map((s) => s.id);
}
export async function readyPortals(userId: string, resumeId: string) {
  return (await connectionStatuses(userId))
    .filter(
      (connection) =>
        connection.connected &&
        (!["gupy", "infojobs"].includes(connection.id) ||
          connection.profileResumeId === resumeId),
    )
    .map((connection) => connection.id);
}
async function closeLogin(userId: string, portal: CandidatePortal) {
  await closeLoginByKey(key(userId, portal));
}
async function closeLoginByKey(id: string) {
  const session = logins.get(id);
  if (session) {
    if (!session.closing)
      session.closing = (async () => {
        await session.context.close().catch(() => {});
        await session.release();
        if (logins.get(id) === session) logins.delete(id);
      })();
    await session.closing;
  }
}
async function login(userId: string, portal: CandidatePortal) {
  if (!browserAuthorized(portal))
    throw new RequestError("A autorização deste provedor não está disponível.");
  const session = logins.get(key(userId, portal));
  if (!session || session.expires < Date.now()) {
    await closeLogin(userId, portal);
    throw new RequestError(
      "A janela de conexão expirou. Abra o site novamente.",
    );
  }
  return session;
}
async function serial<T>(session: LoginSession, fn: () => Promise<T>) {
  if (session.busy)
    throw new RequestError("Aguarde o site terminar a ação anterior.");
  session.busy = true;
  try {
    return await fn();
  } finally {
    session.busy = false;
  }
}
async function frame(session: LoginSession, portal: CandidatePortal) {
  const u = new URL(session.page.url());
  const isAuthenticated = await authenticated(session.page, portal);
  // An authenticated feed's search box is never a login field.
  const fields = isAuthenticated ? [] : await editableLoginFields(session.page);
  let notice = "";
  const alerts = session.page.locator(
    '[role="alert"], #error-for-password, #error-for-username, .MuiAlert-message, .validation-summary-errors, .field-validation-error',
  );
  for (let index = 0; index < (await alerts.count()); index++)
    if (await alerts.nth(index).isVisible()) {
      const message = (await alerts.nth(index).innerText()).trim();
      if (message) {
        notice = message.slice(0, 600);
        break;
      }
    }
  const blocked = await session.page
    .getByText(/^(Humans only|Access denied|Acesso negado)$/i)
    .first()
    .isVisible()
    .catch(() => false);
  if (blocked && !notice)
    notice =
      "Este site bloqueou o acesso pelo navegador de candidaturas. A conta não foi conectada. Você pode tentar novamente mais tarde ou acessar o portal diretamente.";
  return {
    image: `data:image/jpeg;base64,${(await session.page.screenshot({ type: "jpeg", quality: 75, timeout: 10000 })).toString("base64")}`,
    width: 1024,
    height: 720,
    address: u.hostname + u.pathname,
    fields,
    notice,
    blocked,
    authenticated: isAuthenticated,
  };
}
export async function startPortalLogin(
  userId: string,
  portal: CandidatePortal,
) {
  if (!browserAuthorized(portal))
    throw new RequestError(
      "Este provedor não tem autorização de conexão por navegador configurada. Use o site oficial ou uma integração aprovada.",
    );
  await closeLogin(userId, portal);
  if (
    logins.size + openingLogins >=
    Number(process.env.PORTAL_LOGIN_LIMIT || 4)
  )
    throw new RequestError(
      "Todas as janelas de conexão estão ocupadas. Tente novamente em instantes.",
    );
  openingLogins++;
  let release: (() => Promise<void>) | undefined;
  let c: BrowserContext | undefined;
  try {
    release = await lease(userId, portal);
    const saved = await load(userId, portal);
    c = await context(portal, saved);
    const page = await c.newPage();
    const session = {
      context: c,
      page,
      expires: Date.now() + 15 * 60 * 1000,
      release,
      busy: false,
    };
    logins.set(key(userId, portal), session);
    await page
      .goto(saved ? portalRules[portal].account : portalLogin[portal], {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      })
      .catch(() => {
        throw new RequestError(
          "Não foi possível carregar este site. Tente abrir a conexão novamente em instantes.",
        );
      });
    await page.waitForTimeout(700);
    if (!(await authenticated(page, portal)))
      await page
        .locator('input:not([type="hidden"])')
        .first()
        .waitFor({ state: "visible", timeout: 6000 })
        .catch(() => {});
    return await frame(session, portal);
  } catch (error) {
    if (c) await c.close();
    logins.delete(key(userId, portal));
    await release?.();
    throw error;
  } finally {
    openingLogins--;
  }
}
export type LoginAction =
  | { type: "submit"; fields: { index: number; key?: string; value: string }[] }
  | { type: "click"; x: number; y: number }
  | { type: "text"; value: string }
  | { type: "fill"; index: number; value: string }
  | { type: "key"; value: string }
  | { type: "scroll"; delta: number }
  | { type: "refresh" };
export async function portalLoginAction(
  userId: string,
  portal: CandidatePortal,
  action: LoginAction,
) {
  const session = await login(userId, portal);
  return serial(session, async () => {
    if (action.type === "submit") {
      const targets = [];
      for (const item of action.fields) {
        const field = session.page.locator(loginInputs).nth(item.index);
        if (
          !(await field.isVisible()) ||
          !(await field.isEditable()) ||
          (item.key &&
            (await readLoginField(field, item.index)).key !== item.key)
        )
          throw new RequestError(
            "O formul\u00e1rio mudou. Atualize a janela e preencha os campos novamente.",
          );
        targets.push({ field, value: item.value });
      }
      if (!targets.length)
        throw new RequestError("Preencha os campos antes de continuar.");
      for (const { field, value } of targets) await field.fill(value);
      await submitLoginForm(targets.at(-1)!.field);
    } else if (action.type === "click")
      await session.page.mouse.click(action.x, action.y);
    else if (action.type === "fill") {
      const field = session.page
        .locator(
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea',
        )
        .nth(action.index);
      if (!(await field.isVisible()))
        throw new RequestError(
          "O campo mudou. Atualize a janela e tente novamente.",
        );
      await field.fill(action.value);
    } else if (action.type === "text")
      await session.page.keyboard.insertText(action.value);
    else if (action.type === "key")
      await session.page.keyboard.press(action.value);
    else if (action.type === "scroll")
      await session.page.mouse.wheel(0, action.delta);
    await session.page.waitForTimeout(action.type === "refresh" ? 100 : 500);
    return frame(session, portal);
  });
}
export async function finishPortalLogin(
  userId: string,
  portal: CandidatePortal,
  profileResumeId: string | null,
) {
  const session = await login(userId, portal);
  return serial(session, async () => {
    if (
      !(await authenticated(session.page, portal)) &&
      !/signin|sign-in|\/login|checkpoint|challenge|authwall|signup/i.test(
        new URL(session.page.url()).pathname,
      )
    ) {
      await session.page
        .goto(portalRules[portal].account, {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        })
        .catch(() => {});
      await session.page.waitForTimeout(800);
    }
    if (!(await authenticated(session.page, portal)))
      throw new RequestError(
        "Ainda não conseguimos confirmar o login. Entre com e-mail e senha, conclua a verificação e tente confirmar novamente.",
      );
    await save(userId, portal, {
      connectedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      profileResumeId,
      state: await session.context.storageState({ indexedDB: true }),
    });
    await closeLogin(userId, portal);
    return { ok: true };
  });
}
export async function cancelPortalLogin(
  userId: string,
  portal: CandidatePortal,
) {
  await closeLogin(userId, portal);
}
export async function closeUserPortalLogins(userId: string) {
  for (const portal of candidatePortals) await closeLogin(userId, portal);
}
export async function disconnectPortal(
  userId: string,
  portal: CandidatePortal,
) {
  await closeLogin(userId, portal);
  // Acquire the same lease used by workers before removing a live connection.
  const release = await lease(userId, portal);
  try {
    await rm(path(userId, portal), { force: true });
  } finally {
    await release();
  }
}
export async function deletePortalConnections(userId: string) {
  for (const portal of candidatePortals) await disconnectPortal(userId, portal);
}
export async function sendNativeApplication(
  userId: string,
  portal: CandidatePortal,
  resumeId: string,
  input: PortalApplication,
): Promise<PortalResult> {
  if (!browserAuthorized(portal))
    return {
      status: "action_required",
      message:
        "O provedor não tem permissão de envio por navegador configurada. Finalize no site oficial.",
    };
  const release = await lease(userId, portal).catch(() => null);
  if (!release)
    return {
      status: "action_required",
      message:
        "Este site está aberto para conexão ou outra candidatura. Aguarde a conclusão e confira esta candidatura.",
    };
  let c: BrowserContext | undefined;
  try {
    const saved = await load(userId, portal);
    if (!saved)
      return {
        status: "action_required",
        message: "Conecte sua conta neste site antes de enviar candidaturas.",
      };
    try {
      c = await context(portal, saved);
    } catch (error) {
      return {
        status: "action_required",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível abrir o site para envio.",
      };
    }
    const page = await c.newPage();
    const deadline = setTimeout(() => void c?.close(), 120000);
    try {
      const result = await applyOnPage(
        page,
        portal,
        input,
        saved.profileResumeId === resumeId,
      );
      if (
        result.status === "action_required" &&
        /sessão expirou/.test(result.message)
      )
        await rm(path(userId, portal), { force: true });
      else
        await save(userId, portal, {
          ...saved,
          state: await c.storageState({ indexedDB: true }),
        }).catch(() => {});
      return result;
    } finally {
      clearTimeout(deadline);
    }
  } finally {
    await c?.close().catch(() => {});
    await release();
  }
}
const sweeper = setInterval(() => {
  for (const [id, session] of logins)
    if (session.expires < Date.now() && !session.busy) {
      void closeLoginByKey(id).catch(() => {});
    }
}, 30000);
sweeper.unref();
export async function closePortalBrowsers() {
  for (const id of logins.keys()) await closeLoginByKey(id);
  if (browser) await (await browser.catch(() => null))?.close();
  browser = undefined;
}
