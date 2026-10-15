import { afterEach, expect, it, vi } from "vitest";
import {
  cloudPortalEnabled,
  portalSandboxName,
} from "../server/portal-cloud-policy";
afterEach(() => vi.unstubAllEnvs());
it("isola o navegador do titular e exclui LinkedIn mesmo se configurado", () => {
  vi.stubEnv("PORTAL_CLOUD_ENABLED", "true");
  vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID", "fixture-snapshot");
  vi.stubEnv("PORTAL_CLOUD_OWNER_ID", "alice");
  vi.stubEnv("PORTAL_CLOUD_PORTALS", "gupy,infojobs,glassdoor,linkedin");
  expect(cloudPortalEnabled("alice", "gupy")).toBe(true);
  expect(cloudPortalEnabled("bob", "gupy")).toBe(false);
  expect(cloudPortalEnabled("alice", "linkedin")).toBe(false);
  expect(portalSandboxName("alice", "gupy")).not.toBe(
    portalSandboxName("bob", "gupy"),
  );
  expect(portalSandboxName("alice", "gupy")).not.toContain("alice");
  vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID", "");
  expect(cloudPortalEnabled("alice", "gupy")).toBe(false);
});
