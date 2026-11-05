import { expect, it, vi } from "vitest";
import type { BrowserContext } from "playwright";
import { guardAtsPage, atsHostResolverRules } from "../server/ats-network";
import { publicAddress } from "../server/portal-browser-policy";
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
}));

it("pins ATS DNS, blocks unrelated HTTP destinations and closes every WebSocket", async () => {
  let handle!: (route: any) => Promise<void>,
    socketHandler!: (socket: any) => void;
  const context = {
    route: async (_: string, callback: typeof handle) => {
      handle = callback;
    },
    routeWebSocket: async (_: string, callback: typeof socketHandler) => {
      socketHandler = callback;
    },
  } as unknown as BrowserContext;
  expect(await atsHostResolverRules("https://jobs.example/apply")).toBe(
    "MAP jobs.example 8.8.8.8",
  );
  await guardAtsPage(context, "https://jobs.example/apply");
  for (const url of [
    "http://127.0.0.1/",
    "https://evil.example/steal",
    "https://jobs.example/apply",
  ]) {
    const abort = vi.fn(),
      proceed = vi.fn();
    await handle({
      request: () => ({ url: () => url }),
      abort,
      continue: proceed,
    });
    expect(proceed).toHaveBeenCalledTimes(
      url === "https://jobs.example/apply" ? 1 : 0,
    );
    expect(abort).toHaveBeenCalledTimes(
      url === "https://jobs.example/apply" ? 0 : 1,
    );
  }
  const close = vi.fn();
  socketHandler({ close });
  expect(close).toHaveBeenCalledOnce();
});
it.each([
  "2002:7f00:1::1",
  "2001:0:4136:e378:8000:63bf:3fff:fdd2",
  "198.51.100.1",
  "203.0.113.1",
])(
  "uses the same special-address deny policy in portal sessions: %s",
  (address) => {
    expect(publicAddress(address)).toBe(false);
  },
);
