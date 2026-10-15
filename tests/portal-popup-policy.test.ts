import { expect, it, vi } from "vitest";
import type { BrowserContext } from "playwright";
import { protectBrowser } from "../server/portal-browser-policy";

vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "8.8.8.8", family: 4 }],
}));

it.each([true, false])(
  "aplica a política ao primeiro pedido de popup sem frame (interativo=%s)",
  async (interactiveLogin) => {
    let handle!: (route: any) => Promise<void>;
    const blocked = vi.fn();
    await protectBrowser(
      {
        route: async (_pattern: string, callback: typeof handle) => {
          handle = callback;
        },
        routeWebSocket: async () => {},
      } as unknown as BrowserContext,
      "gupy",
      { interactiveLogin, onBlockedNavigation: blocked },
    );
    const abort = vi.fn(),
      proceed = vi.fn();
    await handle({
      request: () => ({
        url: () => "https://accounts.google.com/signin",
        isNavigationRequest: () => true,
        frame: () => {
          throw Error("Frame not yet created");
        },
      }),
      abort,
      continue: proceed,
    });
    expect(proceed).toHaveBeenCalledTimes(interactiveLogin ? 1 : 0);
    expect(abort).toHaveBeenCalledTimes(interactiveLogin ? 0 : 1);
    expect(blocked).toHaveBeenCalledTimes(interactiveLogin ? 0 : 1);
  },
);
