import{expect,it,vi}from"vitest";
const mocks=vi.hoisted(()=>({getOrCreate:vi.fn(),update:vi.fn().mockRejectedValue(new Error("policy refused")),runCommand:vi.fn(),writeFiles:vi.fn()}));
vi.mock("@vercel/sandbox",()=>({Sandbox:{getOrCreate:mocks.getOrCreate}}));
vi.mock("../server/db",()=>({store:{},mutateWorkspace:vi.fn()}));
vi.mock("../server/portal-cloud-policy",()=>({cloudPortalEnabled:()=>true,cloudPortalCanApply:()=>true,portalSandboxName:()=>"synthetic-portal"}));
import{cloudPortalCommand}from"../server/portal-cloud";
it("requires a persisted network policy before resuming commands or transmitting candidate data",async()=>{
 mocks.getOrCreate.mockResolvedValue({status:"stopped",update:mocks.update,runCommand:mocks.runCommand,writeFiles:mocks.writeFiles});
 const result=await cloudPortalCommand("synthetic-user","gupy",{op:"apply",input:{candidate:"private synthetic value"}as any});
 expect(result).toMatchObject({status:"action_required",retryable:true});
 expect(mocks.update).toHaveBeenCalledOnce();expect(mocks.update.mock.calls[0][0]).toHaveProperty("networkPolicy");
 expect(mocks.runCommand).not.toHaveBeenCalled();expect(mocks.writeFiles).not.toHaveBeenCalled();
});
