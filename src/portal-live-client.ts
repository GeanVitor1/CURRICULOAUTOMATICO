import type { LiveInput, LiveTicket } from "../shared/portal-live";

type Listener = {
  image: (image: string) => void;
  status: (status: {
    authenticated: boolean;
    blocked: boolean;
    notice: string;
  }) => void;
  error: (error: Error) => void;
};
export class PortalLiveClient {
  private socket: WebSocket;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      start: number;
      type: string;
    }
  >();
  private ready: Promise<void>;
  private closed = false;
  constructor(
    ticket: LiveTicket,
    private listener: Listener,
  ) {
    const url = new URL(ticket.url);
    if (
      url.protocol !== "wss:" ||
      !url.hostname.endsWith(".vercel.run") ||
      url.pathname !== "/live" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !/^[a-f0-9]{64}$/.test(ticket.token) ||
      ticket.expiresAt <= Date.now()
    )
      throw new Error(
        "A conexão do navegador expirou. Abra a janela novamente.",
      );
    this.socket = new WebSocket(url.href, [
      "empregatos-live",
      "eg." + ticket.token,
    ]);
    this.ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Não foi possível conectar ao navegador."));
        this.socket.close();
      }, 12000);
      const failed = () => {
        clearTimeout(timeout);
        reject(new Error("A conexão com o navegador foi interrompida."));
      };
      this.socket.addEventListener("close", failed, { once: true });
      this.socket.addEventListener("error", failed, { once: true });
      this.socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === "ready") {
          clearTimeout(timeout);
          resolve();
        }
        if (
          message.type === "frame" &&
          typeof message.image === "string" &&
          message.image.startsWith("data:image/jpeg;base64,") &&
          message.image.length < 3000000
        )
          listener.image(message.image);
        if (
          message.type === "status" &&
          typeof message.authenticated === "boolean" &&
          typeof message.blocked === "boolean"
        )
          listener.status({
            authenticated: message.authenticated,
            blocked: message.blocked,
            notice: typeof message.notice === "string" ? message.notice : "",
          });
        if (message.type !== "ack") return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        performance.measure("remote-input", {
          start: pending.start,
          detail: { type: pending.type },
        });
        if (message.error)
          pending.reject(
            new Error(
              "A ação não foi confirmada. Tente novamente e confira o campo.",
            ),
          );
        else pending.resolve();
      });
    });
    void this.ready.catch((error) => {
      if (!this.closed) listener.error(error);
    });
    this.socket.addEventListener("close", () => {
      const error = new Error(
        "A conexão com o navegador foi interrompida. Tente novamente antes de continuar.",
      );
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(error);
      }
      this.pending.clear();
      if (!this.closed) listener.error(error);
    });
  }
  async send(action: LiveInput) {
    await this.ready;
    if (
      this.closed ||
      this.socket.readyState !== WebSocket.OPEN ||
      this.pending.size >= 64
    )
      throw new Error("A conexão com o navegador está indisponível.");
    const id = ++this.nextId;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "A ação demorou a responder. Confira o campo antes de continuar.",
          ),
        );
        this.socket.close();
      }, 10000);
      this.pending.set(id, {
        resolve,
        reject,
        timer,
        start: performance.now(),
        type: action.type,
      });
      this.socket.send(JSON.stringify({ id, action }));
    });
  }
  close() {
    this.closed = true;
    this.socket.close();
  }
}
