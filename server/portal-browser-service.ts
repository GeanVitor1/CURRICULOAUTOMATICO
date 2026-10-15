import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type CDPSession,
} from "playwright";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
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
  portalHost,
  loginNavigationAllowed,
  identityHost,
  type CandidatePortal,
} from "./portal-browser-policy";
import {
  editableLoginFields,
  loginInputs,
  readLoginField,
  submitLoginForm,
} from "./portal-login-fields";
import type { LoginAction } from "./portal-sessions";
import type { LiveInput, LiveTicket } from "../shared/portal-live";

type Saved = {
  connectedAt: string;
  verifiedAt: string;
  profileResumeId: string | null;
  state: Awaited<ReturnType<BrowserContext["storageState"]>>;
};
export type PortalLoginFrame = {
  viewerId: string;
  image: string;
  width: number;
  height: number;
  address: string;
  fields: Awaited<ReturnType<typeof editableLoginFields>>;
  authenticated: boolean;
  blocked: boolean;
  notice: string;
  live?: LiveTicket;
  navigationError?: string;
};
export class PortalBrowserService {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private rootPage?: Page;
  private navigationError = "";
  private navigationStarted = Date.now();
  private displayListeners = new Set<(page: Page) => void>();
  private expires = 0;
  private busy = false;
  private viewerId = "";
  private stopLive?: () => Promise<void>;
  isBusy() {
    return this.busy;
  }
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
    // Keep only the candidate portal's session, never the Google/LinkedIn account.
    value = {
      ...value,
      state: {
        ...value.state,
        cookies: value.state.cookies.filter((cookie) =>
          portalHost(
            this.portal,
            "https://" + cookie.domain.replace(/^\./, ""),
          ),
        ),
        origins: value.state.origins.filter((origin) =>
          portalHost(this.portal, origin.origin),
        ),
      },
    };
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
  private async createContext(
    saved: Saved | null,
    width = 1024,
    interactiveLogin = false,
  ) {
    if (!this.browser?.isConnected())
      this.browser = await chromium.launch({
        headless: true,
        chromiumSandbox: process.platform === "linux",
        timeout: 20000,
      });
    const context = await this.browser.newContext({
      viewport: { width, height: 720 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      storageState: saved?.state,
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    context.setDefaultTimeout(8000);
    await protectBrowser(context, this.portal, {
      interactiveLogin,
      onBlockedNavigation: () => {
        if (interactiveLogin)
          this.navigationError =
            "Este destino não está disponível nesta janela. Volte ao login do portal para continuar.";
      },
    });
    if (interactiveLogin) context.on("page", (page) => this.watchPage(page));
    return context;
  }
  private activatePage(page: Page) {
    if (page.isClosed() || this.page === page) return;
    this.page = page;
    this.navigationError = "";
    this.navigationStarted = Date.now();
    for (const listener of this.displayListeners) listener(page);
    void page.bringToFront().catch(() => {});
  }
  private watchPage(page: Page) {
    // A popup's first navigation can finish before the context emits `page`.
    if (loginNavigationAllowed(this.portal, page.url(), true))
      this.activatePage(page);
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      if (loginNavigationAllowed(this.portal, page.url(), true)) {
        this.navigationError = "";
        this.navigationStarted = Date.now();
        this.activatePage(page);
      }
    });
    page.on("requestfailed", (request) => {
      let mainNavigation = request.isNavigationRequest();
      if (mainNavigation) {
        try {
          mainNavigation = request.frame() === page.mainFrame();
        } catch {
          // Popup navigation may fail before its frame exists.
        }
      }
      if (
        mainNavigation &&
        !/ERR_ABORTED/.test(request.failure()?.errorText || "")
      )
        this.navigationError ||=
          "Não foi possível carregar a página de login. Volte ao portal e tente novamente.";
    });
    page.on("close", () => {
      if (this.page !== page || !this.context) return;
      const next =
        this.rootPage && !this.rootPage.isClosed()
          ? this.rootPage
          : this.context
              .pages()
              .find(
                (p) =>
                  !p.isClosed() &&
                  loginNavigationAllowed(this.portal, p.url(), true),
              );
      if (next) this.activatePage(next);
    });
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
      viewerId: this.viewerId,
      image:
        "data:image/jpeg;base64," +
        (
          await page.screenshot({ type: "jpeg", quality: 70, timeout: 10000 })
        ).toString("base64"),
      width: page.viewportSize()?.width || 1024,
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
      navigationError: this.navigationError,
    };
  }
  async close() {
    await this.stopLive?.();
    this.stopLive = undefined;
    await this.context?.close().catch(() => {});
    this.context = undefined;
    this.page = undefined;
    this.rootPage = undefined;
    this.navigationError = "";
  }
  async open(width = 1024) {
    await this.close();
    this.viewerId = randomUUID();
    const saved = await this.load();
    this.context = await this.createContext(
      saved,
      Math.max(375, Math.min(1024, Math.round(width))),
      true,
    );
    this.page = await this.context.newPage();
    this.rootPage = this.page;
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
  private async input(action: LoginAction | LiveInput) {
    if (!this.page || this.expires < Date.now())
      throw new Error("A janela de conexão expirou. Abra novamente.");
    const page = this.page;
    if (action.type === "login") {
      const root = this.rootPage;
      if (!root || root.isClosed())
        throw new Error("A janela de conexão expirou. Abra novamente.");
      this.activatePage(root);
      await Promise.all(
        this.context!.pages()
          .filter((p) => p !== root)
          .map((p) => p.close().catch(() => {})),
      );
      this.navigationError = "";
      await root.goto(portalLogin[this.portal], {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
    } else if (action.type === "submit") {
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
  }
  async action(action: LoginAction) {
    await this.input(action);
    return this.frame();
  }
  private assertViewer(viewerId: string) {
    if (viewerId !== this.viewerId || !this.page || this.expires < Date.now())
      throw new Error(
        "Esta janela de conexão foi substituída ou expirou. Abra o navegador novamente.",
      );
  }
  async liveInput(viewerId: string, action: LiveInput) {
    this.assertViewer(viewerId);
    if (this.busy)
      throw new Error(
        "O portal já está executando uma ação. Aguarde a conclusão.",
      );
    this.busy = true;
    try {
      await this.input(action);
    } finally {
      this.busy = false;
    }
  }
  async startLive(
    viewerId: string,
    onImage: (image: string) => void,
    onStatus: (status: {
      authenticated: boolean;
      blocked: boolean;
      notice: string;
      address?: string;
      navigationError?: string;
    }) => void,
    onEnd: () => void,
  ) {
    this.assertViewer(viewerId);
    await this.stopLive?.();
    let cdp: CDPSession | undefined;
    let ended = false,
      checking = false,
      lastImage = 0;
    let latestImage = "";
    let imageTimer: ReturnType<typeof setTimeout> | undefined;
    let switches = Promise.resolve();
    const deliverImage = () => {
      imageTimer = undefined;
      if (ended || !latestImage) return;
      lastImage = Date.now();
      onImage(latestImage);
      latestImage = "";
    };
    const switchPage = (page: Page) => {
      switches = switches
        .then(async () => {
          if (ended || page.isClosed() || page !== this.page) return;
          clearTimeout(imageTimer);
          latestImage = "";
          await cdp?.send("Page.stopScreencast").catch(() => {});
          await cdp?.detach().catch(() => {});
          const session = await page.context().newCDPSession(page);
          cdp = session;
          session.on("Page.screencastFrame", (event) => {
            void session
              .send("Page.screencastFrameAck", { sessionId: event.sessionId })
              .catch(() => {});
            if (ended || page !== this.page) return;
            latestImage = "data:image/jpeg;base64," + event.data;
            if (Date.now() - lastImage >= 70) {
              clearTimeout(imageTimer);
              deliverImage();
            } else
              imageTimer ||= setTimeout(
                deliverImage,
                70 - (Date.now() - lastImage),
              );
          });
          await session.send("Page.startScreencast", {
            format: "jpeg",
            quality: 65,
            maxWidth: 1024,
            maxHeight: 720,
            everyNthFrame: 1,
          });
        })
        .catch(() => {
          if (!ended)
            this.navigationError =
              "Não foi possível exibir a página de login. Volte ao portal para tentar novamente.";
        });
      return switches;
    };
    this.displayListeners.add(switchPage);
    await switchPage(this.page!);
    const update = async () => {
      if (checking || ended || this.busy) return;
      checking = true;
      try {
        this.assertViewer(viewerId);
        if (
          this.rootPage &&
          this.page !== this.rootPage &&
          !this.rootPage.isClosed() &&
          (await authenticated(this.rootPage, this.portal))
        )
          this.activatePage(this.rootPage);
        const page = this.page!;
        const signed = await authenticated(page, this.portal);
        const text = await page.locator("body").innerText({ timeout: 1000 });
        const blocked =
          /access denied|acesso negado|humans only|request (?:was )?blocked|you have been blocked/i.test(
            text,
          );
        if (
          identityHost(page.url()) &&
          /disallowed_useragent|this browser or app may not be secure|este navegador ou app pode não ser seguro|couldn.t sign you in|não foi possível fazer login|access blocked|acesso bloqueado/i.test(
            text,
          )
        )
          this.navigationError =
            "O provedor recusou o acesso neste navegador. Volte ao portal e use a entrada com e-mail ou sem senha, se disponível.";
        if (!text.trim() && Date.now() - this.navigationStarted > 10000)
          this.navigationError ||=
            "A página de login não carregou. Volte ao portal para tentar novamente.";
        const url = new URL(page.url());
        onStatus({
          authenticated: signed,
          blocked,
          notice: blocked ? "O portal bloqueou o acesso." : "",
          address: url.hostname + url.pathname,
          navigationError: this.navigationError,
        });
      } catch {
        if (
          !this.context ||
          viewerId !== this.viewerId ||
          this.expires < Date.now()
        )
          onEnd();
      } finally {
        checking = false;
      }
    };
    const interval = setInterval(() => void update(), 500);
    void update();
    let cleanup: Promise<void> | undefined;
    this.stopLive = () =>
      (cleanup ||= (async () => {
        ended = true;
        this.displayListeners.delete(switchPage);
        clearTimeout(imageTimer);
        clearInterval(interval);
        await switches;
        await cdp?.send("Page.stopScreencast").catch(() => {});
        await cdp?.detach().catch(() => {});
      })());
    return this.stopLive;
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
    viewerId?: string;
    viewportWidth?: number;
  }) {
    if (this.busy)
      throw new Error(
        "O portal já está executando uma ação. Aguarde a conclusão.",
      );
    this.busy = true;
    try {
      if (request.viewerId && request.viewerId !== this.viewerId)
        throw new Error(
          "Esta janela de conexão foi substituída ou expirou. Abra o navegador novamente.",
        );
      if (request.op === "open") return await this.open(request.viewportWidth);
      if (request.op === "action" && request.action)
        return await this.action(request.action);
      if (request.op === "confirm")
        return await this.confirm(request.resumeId || null);
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
