import {expect,it,vi} from "vitest";
const create=vi.hoisted(()=>vi.fn().mockRejectedValue(Object.assign(new Error("Invalid network policy"),{response:{status:400}})));
vi.mock("@vercel/sandbox",()=>({Sandbox:{create}}));
import {sendAtsApplication} from "../server/ats-execution";
it("uses supported IPv4 CIDRs and records a definite pre-browser refusal without submitting",async()=>{
  vi.stubEnv("ATS_PUBLIC_FORM_PLATFORMS","lever");
  vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","fixture-snapshot");
  const result=await sendAtsApplication({destination:{platform:"lever",state:"verified",expiresAt:new Date(Date.now()+60000).toISOString(),url:"https://jobs.lever.co/company/96ec1808-6b61-4fda-832b-58d7c104edd9/apply"}} as never);
  expect(result).toMatchObject({status:"action_required",retryable:true});
  expect(result.message).toContain("HTTP 400");
  expect(create.mock.calls[0][0].networkPolicy.subnets.deny.every((cidr:string)=>!cidr.includes(":"))).toBe(true);
  expect(create.mock.calls[0][0].networkPolicy.allow).toEqual({"jobs.lever.co":[]});
  vi.unstubAllEnvs();
});
it.each(["not-started","started","diagnostic-failed"])("does not infer a safe retry after form execution or an unavailable phase check: %s",async phase=>{
  vi.stubEnv("ATS_PUBLIC_FORM_PLATFORMS","lever");
  vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","fixture-snapshot");
  const sandbox={mkDir:vi.fn(),writeFiles:vi.fn(),runCommand:vi.fn().mockResolvedValue({exitCode:1}),readFileToBuffer:phase==="diagnostic-failed"?vi.fn().mockRejectedValue(new Error("unavailable")):vi.fn().mockResolvedValue(phase==="started"?Buffer.from("1"):undefined),stop:vi.fn()};
  create.mockResolvedValueOnce(sandbox);
  const result=await sendAtsApplication({destination:{platform:"lever",state:"verified",expiresAt:new Date(Date.now()+60000).toISOString(),url:"https://jobs.lever.co/company/96ec1808-6b61-4fda-832b-58d7c104edd9/apply"}} as never);
  expect(result.status).toBe(phase==="not-started"?"action_required":"unknown");
  expect(result.retryable).toBe(phase==="not-started"?true:undefined);
  expect(sandbox.stop).toHaveBeenCalledOnce();
  vi.unstubAllEnvs();
});
