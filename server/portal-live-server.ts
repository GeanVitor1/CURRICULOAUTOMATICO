import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { liveInputSchema } from "../shared/portal-live";
import type { PortalBrowserService } from "./portal-browser-service";

export class PortalLiveServer {
  readonly server: Server;
  private sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 16384,
    perMessageDeflate: false,
    handleProtocols: (protocols) =>
      protocols.has("empregatos-live") ? "empregatos-live" : false,
  });
  private ticket?: {
    token: string;
    viewerId: string;
    origin: string;
    expiresAt: number;
  };
  private active?: WebSocket;
  constructor(private service: PortalBrowserService) {
    this.server = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    this.server.on("upgrade", (req, socket, head) => {
      const ticket = this.ticket;
      const protocols = String(req.headers["sec-websocket-protocol"] || "")
        .split(",")
        .map((p) => p.trim());
      const supplied = Buffer.from(
        protocols.find((p) => p.startsWith("eg."))?.slice(3) || "",
      );
      const expected = Buffer.from(ticket?.token || "");
      if (
        req.url !== "/live" ||
        !ticket ||
        ticket.expiresAt <= Date.now() ||
        req.headers.origin !== ticket.origin ||
        !expected.length ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected) ||
        !protocols.includes("empregatos-live")
      ) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        return;
      }
      this.sockets.handleUpgrade(req, socket, head, (ws) => {
        this.connect(ws, ticket);
      });
    });
  }
  issue(viewerId: string, origin: string) {
    this.revoke();
    const url = new URL(origin);
    if (url.origin !== origin || !["https:", "http:"].includes(url.protocol))
      throw new Error("Invalid viewer origin");
    this.ticket = {
      token: randomBytes(32).toString("hex"),
      viewerId,
      origin,
      expiresAt: Date.now() + 15 * 60000,
    };
    return { token: this.ticket.token, expiresAt: this.ticket.expiresAt };
  }
  revoke() {
    this.ticket = undefined;
    this.active?.close(1000);
    this.active = undefined;
  }
  private connect(
    ws: WebSocket,
    ticket: NonNullable<PortalLiveServer["ticket"]>,
  ) {
    this.active?.close(1000);
    this.active = ws;
    let stopped = false,
      waiting = 0,
      failed = false,
      sequence = Promise.resolve(),
      lastId = 0;
    let stopStream: (() => Promise<void>) | undefined;
    const send = (value: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
    };
    const expiry = setTimeout(
      () => ws.close(1000),
      Math.max(1, ticket.expiresAt - Date.now()),
    );
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(expiry);
      void stopStream?.();
    };
    ws.on("close", stop);
    ws.on("error", stop);
    ws.on("message", (bytes, binary) => {
      if (binary || waiting >= 64 || stopped || this.ticket !== ticket) {
        ws.close(1008);
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(bytes.toString());
      } catch {
        ws.close(1008);
        return;
      }
      const message = parsed as { id?: number; action?: unknown };
      const action = liveInputSchema.safeParse(message?.action);
      if (
        !Number.isSafeInteger(message?.id) ||
        message.id! <= lastId ||
        !action.success
      ) {
        ws.close(1008);
        return;
      }
      const id = message.id!;
      lastId = id;
      waiting++;
      sequence = sequence.then(async () => {
        if (stopped || this.ticket !== ticket) return;
        try {
          const recovery = ["refresh", "login"].includes(action.data.type);
          if (failed && !recovery)
            throw new Error("Atualize a conexão antes de continuar.");
          await this.service.liveInput(ticket.viewerId, action.data);
          if (recovery) failed = false;
          send({ type: "ack", id });
        } catch {
          failed = true;
          send({
            type: "ack",
            id,
            error:
              "A ação não foi confirmada. Tente novamente e confira o campo antes de continuar.",
          });
        } finally {
          waiting--;
        }
      });
    });
    void this.service
      .startLive(
        ticket.viewerId,
        (image) => {
          if (ws.bufferedAmount < 512000) send({ type: "frame", image });
        },
        (status) => send({ type: "status", ...status }),
        () => ws.close(1000),
      )
      .then((cleanup) => {
        stopStream = cleanup;
        if (stopped) void cleanup();
        else send({ type: "ready" });
      })
      .catch(() => ws.close(1011));
  }
  async close() {
    this.revoke();
    for (const ws of this.sockets.clients) ws.terminate();
    this.sockets.close();
    if (this.server.listening)
      await new Promise<void>((resolve, reject) =>
        this.server.close((error) => (error ? reject(error) : resolve())),
      );
  }
}
