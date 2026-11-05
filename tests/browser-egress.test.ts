import { afterEach, expect, it, vi } from "vitest";
import { connect, createServer, type Socket } from "node:net";
import { createServer as httpServer } from "node:http";
import { createBrowserEgress, launchProtectedBrowser } from "../server/browser-egress";
import { browserNetworkPolicy, PRIVATE_NETWORKS } from "../server/browser-network-policy";
const cleanup: (()=>Promise<unknown>)[]=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
function exchange(url:string, authority:string, payload="") {
  return new Promise<string>((resolve,reject)=>{
    const target=new URL(url);const client=connect(Number(target.port),target.hostname);
    let received="",sent=false;
    client.setTimeout(3000,()=>client.destroy(Error("test timeout")));
    client.on("connect",()=>client.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
    client.on("error",reject);
    client.on("data",part=>{
      received+=part.toString();
      if(received.includes("200 Connection Established")&&!sent){sent=true;client.write(payload);}
      if(received.includes("403 Forbidden")||payload&&received.endsWith(payload)){resolve(received);client.destroy();}
    });
  });
}
it("pins the checked numeric address rather than resolving the hostname again when dialing",async()=>{
  const sockets=new Set<Socket>();
  const destination=createServer(socket=>{sockets.add(socket);socket.on("close",()=>sockets.delete(socket));socket.pipe(socket);});
  await new Promise<void>(resolve=>destination.listen(0,"127.0.0.1",resolve));
  cleanup.push(async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>destination.close(()=>resolve()));});
  const port=(destination.address() as {port:number}).port;
  const resolve=vi.fn(async()=>[{address:"8.8.8.8",family:4}]);
  const dial=vi.fn(()=>connect(port,"127.0.0.1"));
  const proxy=await createBrowserEgress({resolve,dial});cleanup.push(proxy.close);
  expect(await exchange(proxy.url,"employer.example:443","synthetic-tls-bytes")).toContain("synthetic-tls-bytes");
  expect(resolve).toHaveBeenCalledOnce();expect(dial).toHaveBeenCalledWith({address:"8.8.8.8",family:4},443);
});
it.each(["127.0.0.1:443","employer.example:80","employer.example:443/path","user@employer.example:443","[::1]:443"])("rejects invalid or private tunnels: %s",async authority=>{
  const dial=vi.fn();const proxy=await createBrowserEgress({resolve:async()=>[{address:"127.0.0.1",family:4}],dial});cleanup.push(proxy.close);
  expect(await exchange(proxy.url,authority)).toContain("403 Forbidden");expect(dial).not.toHaveBeenCalled();
});
it("rejects mixed public/private DNS results",async()=>{
  const dial=vi.fn();const proxy=await createBrowserEgress({resolve:async()=>[{address:"8.8.8.8",family:4},{address:"169.254.169.254",family:4}],dial});cleanup.push(proxy.close);
  expect(await exchange(proxy.url,"employer.example:443")).toContain("403 Forbidden");expect(dial).not.toHaveBeenCalled();
});
it("forces actual Chromium loopback requests through the proxy instead of the implicit localhost bypass",async()=>{
  let requests=0;
  const destination=httpServer((_req,res)=>{requests++;res.end("private service");});
  await new Promise<void>(resolve=>destination.listen(0,"127.0.0.1",resolve));
  cleanup.push(()=>new Promise<void>(resolve=>destination.close(()=>resolve())));
  const browser=await launchProtectedBrowser({headless:true});cleanup.push(()=>browser.close());
  const page=await browser.newPage();
  const response=await page.goto(`http://127.0.0.1:${(destination.address() as {port:number}).port}/secret`).catch(()=>null);
  expect(requests).toBe(0);expect(!response||response.status()===403).toBe(true);
},15000);
it.each(["::1","fc00::1","2002:7f00:1::1"])("blocks private or transition IPv6 returned by DNS before dialing: %s",async address=>{
  const dial=vi.fn();const proxy=await createBrowserEgress({resolve:async()=>[{address,family:6}],dial});cleanup.push(proxy.close);
  expect(await exchange(proxy.url,"employer.example:443")).toContain("403 Forbidden");expect(dial).not.toHaveBeenCalled();
});
it("keeps supported cloud deny rules even with wildcard domain access",()=>{
  const policy=browserNetworkPolicy() as {allow:string[];subnets:{deny:string[]}};
  expect(policy.allow).toEqual(["*"]);expect(policy.subnets.deny).toEqual(PRIVATE_NETWORKS);
  expect(policy.subnets.deny.every(cidr=>!cidr.includes(":"))).toBe(true);expect(policy.subnets.deny).toContain("169.254.0.0/16");
});
