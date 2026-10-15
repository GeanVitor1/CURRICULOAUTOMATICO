import { expect, it } from "vitest";
import { WebSocket } from "ws";
import { once } from "node:events";
import { PortalLiveServer } from "../server/portal-live-server";
import type { PortalBrowserService } from "../server/portal-browser-service";

it("protege a janela por origem e segredo, mantém ordem e não expõe comandos de envio", async () => {
  const calls: string[] = [];
  let failures = false;
  const service = {
    startLive: async () => async () => {},
    liveInput: async (
      _viewer: string,
      action: { type: string; value?: string },
    ) => {
      if (failures && action.type === "click") throw Error("internal-secret");
      calls.push(action.type + (action.value || ""));
    },
  } as unknown as PortalBrowserService;
  const live = new PortalLiveServer(service);
  live.server.listen(0, "127.0.0.1");
  await once(live.server, "listening");
  const address = live.server.address() as { port: number };
  const url = `ws://127.0.0.1:${address.port}/live`;
  const origin = "https://app.example";
  const ticket = live.issue("viewer-a", origin);
  const connect = (token = ticket.token, from = origin) =>
    new WebSocket(url, ["empregatos-live", "eg." + token], { origin: from });
  try {
    for (const socket of [
      connect("0".repeat(64)),
      connect(ticket.token, "https://other.example"),
    ]) {
      const [error] = await once(socket, "error");
      expect((error as Error).message).toContain("403");
    }
    const socket = connect();
    const messages: any[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await once(socket, "open");
    await expect
      .poll(() => messages.some((m) => m.type === "ready"))
      .toBe(true);
    for (let id = 1; id <= 20; id++)
      socket.send(
        JSON.stringify({ id, action: { type: "text", value: String(id) } }),
      );
    await expect
      .poll(() => messages.filter((m) => m.type === "ack").length)
      .toBe(20);
    expect(calls).toEqual(Array.from({ length: 20 }, (_, i) => `text${i + 1}`));
    failures = true;
    socket.send(
      JSON.stringify({ id: 21, action: { type: "click", x: 1, y: 1 } }),
    );
    socket.send(
      JSON.stringify({
        id: 22,
        action: { type: "text", value: "must-not-run" },
      }),
    );
    await expect
      .poll(() => messages.filter((m) => m.type === "ack").length)
      .toBe(22);
    expect(calls).not.toContain("textmust-not-run");
    expect(JSON.stringify(messages)).not.toContain("internal-secret");
    socket.send(JSON.stringify({ id: 23, action: { type: "refresh" } }));
    socket.send(
      JSON.stringify({
        id: 24,
        action: { type: "text", value: "after-refresh" },
      }),
    );
    await expect.poll(() => calls.includes("textafter-refresh")).toBe(true);
    socket.send(
      JSON.stringify({
        id: 25,
        action: { type: "apply", url: "https://invalid.example" },
      }),
    );
    await once(socket, "close");
    const old = connect();
    await once(old, "open");
    live.issue("viewer-b", origin);
    await once(old, "close");
    const stale = connect();
    const [error] = await once(stale, "error");
    expect((error as Error).message).toContain("403");
  } finally {
    await live.close();
  }
}, 15000);
