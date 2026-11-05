import {afterEach,expect,it,vi} from "vitest";
const create=vi.hoisted(()=>vi.fn().mockRejectedValue(Object.assign(new Error("Invalid network policy"),{response:{status:400}})));
vi.mock("@vercel/sandbox",()=>({Sandbox:{create}}));
import {sendAtsApplication} from "../server/ats-execution";
afterEach(()=>vi.unstubAllEnvs());
it("uses supported cloud CIDRs and records a definite pre-browser refusal without submitting",async()=>{
  vi.stubEnv("ATS_PUBLIC_FORM_PLATFORMS","lever");
  vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","fixture-snapshot");
  const result=await sendAtsApplication({destination:{platform:"lever",state:"verified",expiresAt:new Date(Date.now()+60000).toISOString(),url:"https://jobs.lever.co/company/96ec1808-6b61-4fda-832b-58d7c104edd9/apply"}} as never);
  expect(result).toMatchObject({status:"action_required",retryable:true});
  expect(result.message).toContain("HTTP 400");
  expect(create.mock.calls[0][0].networkPolicy.subnets.deny).toContain("127.0.0.0/8");
  expect(create.mock.calls[0][0].networkPolicy.subnets.deny.every((cidr:string)=>!cidr.includes(":"))).toBe(true);
  expect(create.mock.calls[0][0].networkPolicy.allow).toEqual(["jobs.lever.co"]);
  vi.unstubAllEnvs();
});
it.each(["not-started","started","diagnostic-failed"])("does not infer a safe retry after form execution or an unavailable phase check: %s",async phase=>{
  vi.stubEnv("ATS_PUBLIC_FORM_PLATFORMS","lever");
  vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","fixture-snapshot");
  const sandbox={mkDir:vi.fn(),writeFiles:vi.fn(),runCommand:vi.fn(async({args}:{args:string[]})=>args[0]==="--version"?{exitCode:0,stdout:async()=>"v22.23.4\n"}:{exitCode:1}),readFileToBuffer:phase==="diagnostic-failed"?vi.fn().mockRejectedValue(new Error("unavailable")):vi.fn().mockResolvedValue(phase==="started"?Buffer.from("1"):undefined),stop:vi.fn()};
  create.mockResolvedValueOnce(sandbox);
  const result=await sendAtsApplication({destination:{platform:"lever",state:"verified",expiresAt:new Date(Date.now()+60000).toISOString(),url:"https://jobs.lever.co/company/96ec1808-6b61-4fda-832b-58d7c104edd9/apply"}} as never);
  expect(result.status).toBe(phase==="not-started"?"action_required":"unknown");
  expect(result.retryable).toBe(phase==="not-started"?true:undefined);
  expect(sandbox.stop).toHaveBeenCalledOnce();
  vi.unstubAllEnvs();
});
it("handles hosting quota before transmitting candidate documents",async()=>{
  vi.stubEnv("ATS_PUBLIC_FORM_PLATFORMS","lever");vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","fixture-snapshot");
  create.mockRejectedValueOnce(Object.assign(new Error("quota"),{response:{status:402}}));
  const result=await sendAtsApplication({destination:{platform:"lever",state:"verified",expiresAt:new Date(Date.now()+60000).toISOString(),url:"https://jobs.lever.co/company/96ec1808-6b61-4fda-832b-58d7c104edd9/apply"}}as never);
  expect(result).toMatchObject({status:"action_required",retryable:true});expect(result.message).toContain("limite de armazenamento");
});
it("fails closed before writing candidate documents when the sandbox runtime cannot be secured",async()=>{
  vi.stubEnv("ATS_PUBLIC_FORM_PLATFORMS","lever");vi.stubEnv("PORTAL_CLOUD_SNAPSHOT_ID","fixture-snapshot");
  const sandbox={writeFiles:vi.fn(),mkDir:vi.fn(),runCommand:vi.fn().mockResolvedValue({exitCode:1}),stop:vi.fn()};create.mockResolvedValueOnce(sandbox);
  const result=await sendAtsApplication({destination:{platform:"lever",state:"verified",expiresAt:new Date(Date.now()+60000).toISOString(),url:"https://jobs.lever.co/company/96ec1808-6b61-4fda-832b-58d7c104edd9/apply"}}as never);
  expect(result).toMatchObject({status:"action_required",retryable:true});expect(sandbox.writeFiles).not.toHaveBeenCalled();expect(sandbox.stop).toHaveBeenCalledOnce();
});
