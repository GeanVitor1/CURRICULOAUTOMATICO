import { afterEach, expect, it, vi } from "vitest";
import {
  cloudPortalEnabled,
  portalSandboxName,
  cloudPortalCanApply,
} from "../server/portal-cloud-policy";
import {sessionTransferSuspension} from '../shared/session-transfer-policy';
import {linkedinSessionRetestEnabled,sessionTransferSuspension as accountSuspension} from '../server/session-transfer-policy';
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
  vi.stubEnv("PORTAL_CLOUD_ALL_USERS", "true");
  expect(cloudPortalEnabled("bob", "gupy")).toBe(true);
  expect(cloudPortalEnabled("", "gupy")).toBe(false);
  expect(cloudPortalEnabled("bob", "linkedin")).toBe(false);
  vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID", "");
  expect(cloudPortalEnabled("alice", "gupy")).toBe(false);
});
it('retains the explicitly configured LinkedIn metadata scope without enabling application submissions',()=>{
 vi.stubEnv('PORTAL_CLOUD_ENABLED','true');vi.stubEnv('PORTAL_CLOUD_SNAPSHOT_ID','fixture');vi.stubEnv('PORTAL_CLOUD_ALL_USERS','true');
 vi.stubEnv('PORTAL_CLOUD_SESSION_PORTALS','gupy,infojobs,glassdoor,linkedin');
 expect(cloudPortalEnabled('alice','linkedin')).toBe(false);
 expect(cloudPortalCanApply('alice','linkedin')).toBe(false);
 expect(cloudPortalCanApply('alice','gupy')).toBe(true);
 expect(portalSandboxName('alice','linkedin')).not.toBe(portalSandboxName('alice','gupy'));
});
it('suspends LinkedIn transfers while leaving the other provider policies available',()=>{
 expect(sessionTransferSuspension('linkedin')).toContain('temporariamente suspensa');
 for(const portal of ['gupy','infojobs','glassdoor'])expect(sessionTransferSuspension(portal)).toBeNull();
});
it('uses one project feature flag for every authenticated account while keeping portal runtimes separate',()=>{
 const allowed='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 vi.stubEnv('LINKEDIN_SESSION_RETEST_ENABLED','true');
 expect(accountSuspension('linkedin',allowed)).toContain('temporariamente suspensa');
 expect(accountSuspension('linkedin',other)).toContain('temporariamente suspensa');
 expect(portalSandboxName(allowed,'linkedin')).not.toBe(portalSandboxName(other,'linkedin'));
 vi.stubEnv('PORTAL_CLOUD_ENABLED','true');vi.stubEnv('PORTAL_CLOUD_SNAPSHOT_ID','fixture');vi.stubEnv('PORTAL_CLOUD_SESSION_PORTALS','gupy,infojobs,glassdoor,linkedin');vi.stubEnv('PORTAL_CLOUD_ALL_USERS','false');vi.stubEnv('PORTAL_CLOUD_OWNER_ID',allowed);
 expect(cloudPortalEnabled(other,'linkedin')).toBe(false);expect(cloudPortalCanApply(other,'linkedin')).toBe(false);expect(cloudPortalEnabled(other,'gupy')).toBe(false);
 vi.stubEnv('LINKEDIN_SESSION_RETEST_ENABLED','false');expect(linkedinSessionRetestEnabled(allowed)).toBe(false);
 expect(linkedinSessionRetestEnabled('')).toBe(false);
});
