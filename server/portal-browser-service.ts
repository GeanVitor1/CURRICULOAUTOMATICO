import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
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
import {
  editableLoginFields,
  loginInputs,
  readLoginField,
  submitLoginForm,
} from "./portal-login-fields";
import type { LoginAction } from "./portal-sessions";
import {
  validatePortalState,
  type ImportedPortalState,
} from "./portal-session-import";

type Saved = {
  connectedAt: string;
  verifiedAt: string;
  profileResumeId: string | null;
  state: Awaited<ReturnType<BrowserContext["storageState"]>>;
};
export type PortalLoginFrame = {
  image: string;
  width: number;
  height: number;
  address: string;
  fields: Awaited<ReturnType<typeof editableLoginFields>>;
  authenticated: boolean;
  blocked: boolean;
  notice: string;
};
export class PortalBrowserService {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private expires = 0;
  private busy = false;
  constructor(
    readonly portal: CandidatePortal,
    readonly directory: string,
  ) {}
  private async encryptionKey() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = resolve(this.directory, "session.key");
    try {
      return await readFile(path);
    } catch {
      const key = randomBytes(32);
      try {
        await writeFile(path, key, { flag: "wx", mode: 0o600 });
        return key;
      } catch {
        return readFile(path);
      }
    }
  }
  private async load(): Promise<Saved | null> {
    try {
      const data = await readFile(resolve(this.directory, "session.enc"));
      const decipher = createDecipheriv(
        "aes-256-gcm",
        await this.encryptionKey(),
        data.subarray(0, 12),
      );
      decipher.setAuthTag(data.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          decipher.update(data.subarray(28)),
          decipher.final(),
        ]).toString(),
      );
    } catch {
      return null;
    }
  }
  private async save(value: Saved) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      await this.encryptionKey(),
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    const path = resolve(this.directory, "session.enc");
    await writeFile(
      path + ".tmp",
      Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
      { mode: 0o600 },
    );
    await rename(path + ".tmp", path);
  }
  async metadata() {
    const saved = await this.load();
    if (!saved) return null;
    const expiries = saved.state.cookies
      .map((c) => c.expires)
      .filter((e) => e > 0);
    const expiresAt =
      expiries.length === saved.state.cookies.length && expiries.length
        ? Math.max(...expiries) * 1000
        : null;
    if (expiresAt && expiresAt <= Date.now()) return null;
    return {
      connectedAt: saved.connectedAt,
      verifiedAt: saved.verifiedAt,
      profileResumeId: saved.profileResumeId,
      expiresAt,
    };
  }
  private async createContext(saved: Saved | null) {
    if (!this.browser?.isConnected())
      this.browser = await chromium.launch({
        headless: true,
        chromiumSandbox: process.platform === "linux",
        timeout: 20000,
      });
    const context = await this.browser.newContext({
      viewport: { width: 1024, height: 720 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      storageState: saved?.state,
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    context.setDefaultTimeout(8000);
    await protectBrowser(context, this.portal);
    return context;
  }
  private async frame(): Promise<PortalLoginFrame> {
    if (!this.page || this.expires < Date.now())
      throw new Error("A janela de conexão expirou. Abra novamente.");
    const page = this.page;
    const signed = await authenticated(page, this.portal);
    const fields = signed ? [] : await editableLoginFields(page);
    const text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const blocked =
      /access denied|acesso negado|humans only|request (?:was )?blocked|you have been blocked/i.test(
        text,
      );
    const challenge =
      /captcha|verify you are human|verifique que|verificação de segurança|confirme que você/i.test(
        text,
      );
    return {
      image:
        "data:image/jpeg;base64," +
        (
          await page.screenshot({ type: "jpeg", quality: 70, timeout: 10000 })
        ).toString("base64"),
      width: 1024,
      height: 720,
      address: new URL(page.url()).hostname + new URL(page.url()).pathname,
      fields,
      authenticated: signed,
      blocked,
      notice: blocked
        ? "O portal bloqueou o acesso. Nenhuma candidatura foi enviada por esta janela."
        : challenge
          ? "O portal pediu uma verificação. Resolva manualmente; o sistema não contorna CAPTCHA."
          : "",
    };
  }
  async close() {
    await this.context?.close().catch(() => {});
    this.context = undefined;
    this.page = undefined;
  }
  async open() {
    await this.close();
    const saved = await this.load();
    this.context = await this.createContext(saved);
    this.page = await this.context.newPage();
    this.expires = Date.now() + 15 * 60000;
    await this.page.goto(
      saved ? portalRules[this.portal].account : portalLogin[this.portal],
      { waitUntil: "domcontentloaded", timeout: 25000 },
    );
    await this.page.waitForTimeout(600);
    if (!(await authenticated(this.page, this.portal)))
      await this.page
        .locator(loginInputs)
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {});
    return this.frame();
  }
  async action(action: LoginAction) {
    if (!this.page || this.expires < Date.now())
      throw new Error("A janela de conexão expirou. Abra novamente.");
    const page = this.page;
    if (action.type === "submit") {
      const fields = [];
      for (const item of action.fields) {
        const field = page.locator(loginInputs).nth(item.index);
        if (
          !(await field.isVisible()) ||
          !(await field.isEditable()) ||
          (item.key &&
            (await readLoginField(field, item.index)).key !== item.key)
        )
          throw new Error(
            "O formulário mudou. Atualize a janela e tente novamente.",
          );
        fields.push({ field, value: item.value });
      }
      for (const { field, value } of fields) await field.fill(value);
      if (fields.length) await submitLoginForm(fields.at(-1)!.field);
    } else if (action.type === "fill")
      await page.locator(loginInputs).nth(action.index).fill(action.value);
    else if (action.type === "text")
      await page.keyboard.insertText(action.value);
    else if (action.type === "click")
      await page.mouse.click(action.x, action.y);
    else if (action.type === "key") await page.keyboard.press(action.value);
    else if (action.type === "scroll") await page.mouse.wheel(0, action.delta);
    await page.waitForTimeout(action.type === "refresh" ? 50 : 400);
    return this.frame();
  }
  async confirm(profileResumeId: string | null) {
    if (
      !this.page ||
      !this.context ||
      !(await authenticated(this.page, this.portal))
    )
      throw new Error(
        "O login ainda não foi confirmado pelo portal. Conclua a entrada e a verificação.",
      );
    const previous = await this.load();
    await this.save({
      connectedAt: previous?.connectedAt || new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      profileResumeId,
      state: await this.context.storageState({ indexedDB: true }),
    });
    await this.close();
    return { ok: true };
  }
  async disconnect() {
    await this.close();
    await rm(resolve(this.directory, "session.enc"), { force: true });
  }
  isBusy() {
    return this.busy;
  }
  async importSession(input: ImportedPortalState, resumeId: string) {
    const state = validatePortalState(this.portal, input);
    if (!resumeId) throw new Error("O login precisa de um currículo aprovado.");
    if (this.page)
      throw new Error("O portal já está aberto. Feche a conexão anterior.");
    const previous = await this.load();
    const now = new Date().toISOString();
    const context = await this.createContext({
      state,
      profileResumeId: resumeId,
      connectedAt: now,
      verifiedAt: now,
    });
    try {
      const page = await context.newPage();
      await page.goto(portalRules[this.portal].account, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await page.waitForTimeout(1000);
      if (!(await authenticated(page, this.portal)))
        throw new Error(
          "O login compartilhado não foi confirmado na nuvem. Entre no portal e conecte novamente; o site também pode exigir uma verificação.",
        );
      await this.save({
        state: await context.storageState({ indexedDB: true }),
        profileResumeId: resumeId,
        connectedAt: previous?.connectedAt || now,
        verifiedAt: now,
      });
      return { ok: true };
    } finally {
      await context.close().catch(() => {});
    }
  }
  async apply(
    resumeId: string,
    input: PortalApplication,
  ): Promise<PortalResult> {
    if (this.page)
      return {
        status: "action_required",
        message:
          "Feche a janela de conexão deste portal antes do envio automático.",
      };
    const saved = await this.load();
    if (!saved)
      return {
        status: "action_required",
        message: "Conecte sua conta neste portal para iniciar os envios.",
      };
    if (!/^[a-zA-Z0-9-]+$/.test(input.applicationId))
      throw new Error("Candidatura inválida.");
    const journal = resolve(
      this.directory,
      "attempt-" + input.applicationId + ".json",
    );
    try {
      await writeFile(journal, JSON.stringify({ started: true }), {
        flag: "wx",
        mode: 0o600,
      });
    } catch {
      const old = JSON.parse(await readFile(journal, "utf8"));
      return (
        old.result || {
          status: "unknown",
          message:
            "Esta tentativa já foi iniciada. Confira no portal antes de repetir.",
        }
      );
    }
    const context = await this.createContext(saved);
    const deadline = setTimeout(() => void context.close(), 115000);
    let result: PortalResult;
    try {
      const page = await context.newPage();
      result = await applyOnPage(
        page,
        this.portal,
        input,
        saved.profileResumeId === resumeId,
      );
      // Preserve a portal receipt even if refreshing the session later fails.
      await writeFile(journal, JSON.stringify({ result }), { mode: 0o600 });
      if (
        result.status === "action_required" &&
        /sessão expirou|Entre novamente/i.test(result.message)
      )
        await rm(resolve(this.directory, "session.enc"), { force: true });
      else
        await this.save({
          ...saved,
          verifiedAt: new Date().toISOString(),
          state: await context.storageState({ indexedDB: true }),
        }).catch(() => {});
      return result;
    } finally {
      clearTimeout(deadline);
      await context.close().catch(() => {});
    }
  }
  async execute(request: {
    op: string;
    action?: LoginAction;
    resumeId?: string | null;
    input?: PortalApplication;
    state?: ImportedPortalState;
  }) {
    if (this.busy)
      throw new Error(
        "O portal já está executando uma ação. Aguarde a conclusão.",
      );
    this.busy = true;
    try {
      if (request.op === "open") return await this.open();
      if (request.op === "action" && request.action)
        return await this.action(request.action);
      if (request.op === "confirm")
        return await this.confirm(request.resumeId || null);
      if (request.op === "import" && request.state)
        return await this.importSession(request.state, request.resumeId || "");
      if (request.op === "close") {
        await this.close();
        return { ok: true };
      }
      if (request.op === "disconnect") {
        await this.disconnect();
        return { ok: true };
      }
      if (request.op === "apply" && request.input)
        return await this.apply(request.resumeId || "", request.input);
      if (request.op === "status") return { ok: true };
      throw new Error("Operação indisponível.");
    } finally {
      this.busy = false;
    }
  }
}
