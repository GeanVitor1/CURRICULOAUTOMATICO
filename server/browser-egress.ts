import { createServer } from "node:http";
import { connect, type Socket } from "node:net";
import { lookup } from "node:dns/promises";
import { publicAddress, publicUrl } from "./public-web";
import { chromium, type LaunchOptions } from "playwright";

type Address = { address: string; family: number };
type EgressDependencies = {
  resolve: (host: string) => Promise<Address[]>;
  dial: (address: Address, port: number) => Socket;
};

/** TLS stays end-to-end with Chromium. Only the validated numeric IP is dialed. */
export async function createBrowserEgress(dependencies: Partial<EgressDependencies> = {}) {
  const resolve = dependencies.resolve || ((host: string) => lookup(host, { all: true }));
  const dial = dependencies.dial || ((ip: Address, port: number) => connect({ host: ip.address, family: ip.family, port }));
  const sockets = new Set<Socket>();
  const server = createServer((_request, response) => {
    // Includes plaintext HTTP, absolute URLs, WebSocket upgrades and proxy probing.
    response.writeHead(403, { Connection: "close" }); response.end();
  });
  server.on("connection", socket => {
    if (sockets.size >= 256) { socket.destroy(); return; }
    sockets.add(socket); socket.setTimeout(180000, () => socket.destroy());
    socket.on("error", () => {}); socket.on("close", () => sockets.delete(socket));
  });
  server.on("connect", async (request, client, head) => {
    let upstream: Socket | undefined;
    const deadline = setTimeout(() => client.destroy(), 12000); deadline.unref();
    try {
      // CONNECT authority only; reject path/userinfo/fragment/alternate ports.
      const authority = request.url || "";
      if (!/^[a-zA-Z0-9.-]+:443$/.test(authority)) throw Error("Invalid tunnel");
      const destination = publicUrl(`https://${authority}`);
      const addresses = await resolve(destination.hostname);
      if (client.destroyed) return;
      if (!addresses.length || addresses.some(ip => !publicAddress(ip.address))) throw Error("Non-public destination");
      upstream = dial(addresses.find(ip => ip.family === 4) || addresses[0], 443);
      sockets.add(upstream);
      upstream.on("error", () => client.destroy());
      upstream.on("close", () => { sockets.delete(upstream!); client.destroy(); });
      client.on("close", () => upstream?.destroy());
      upstream.setTimeout(180000, () => upstream?.destroy());
      upstream.once("connect", () => {
        clearTimeout(deadline);
        if (client.destroyed) { upstream?.destroy(); return; }
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream!.write(head);
        client.pipe(upstream!); upstream!.pipe(client);
      });
    } catch {
      upstream?.destroy();
      if (!client.destroyed) client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    } finally {
      if (!upstream) clearTimeout(deadline);
    }
  });
  server.on("upgrade", (_request, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Egress proxy unavailable");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

/** Every browser owned by the application uses this path, including local mode. */
export async function launchProtectedBrowser(options: LaunchOptions = {}) {
  const egress = await createBrowserEgress();
  try {
    const browser = await chromium.launch({
      ...options,
      proxy: { server: egress.url, bypass: "<-loopback>" },
      args: [...(options.args || []), "--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--proxy-bypass-list=<-loopback>"],
    });
    browser.once("disconnected", () => { void egress.close().catch(() => {}); });
    return browser;
  } catch (error) {
    await egress.close(); throw error;
  }
}
