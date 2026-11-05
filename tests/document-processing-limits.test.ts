import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({spawn:vi.fn()}));
vi.mock("node:child_process",()=>{
  const execFile=Object.assign(()=>{}, {[promisify.custom]:async()=>({stdout:'"node.exe","123","Console","1","64 K"'})});
  return {spawn:mock.spawn,execFile};
});
vi.mock("node:fs/promises",()=>({readFile:async()=>"VmRSS: 64 kB"}));
import { parseResumeDocument, PARSER_TIMEOUT_MS } from "../server/document-processing";
function child(){
  const fake=Object.assign(new EventEmitter(),{pid:123,stdin:new PassThrough(),stdout:new PassThrough(),kill:vi.fn()});
  mock.spawn.mockReturnValue(fake);return fake;
}
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it("kills a hung parser on the wall-clock deadline and refuses a second process",async()=>{
  vi.useFakeTimers();const worker=child();
  const pending=parseResumeDocument(Buffer.from("synthetic"),".docx");
  const rejected=expect(pending).rejects.toMatchObject({code:"DOCUMENT_PROCESSING_LIMIT"});
  await expect(parseResumeDocument(Buffer.from("synthetic"),".pdf")).rejects.toMatchObject({statusCode:503});
  await vi.advanceTimersByTimeAsync(PARSER_TIMEOUT_MS+1);await rejected;
  expect(worker.kill).toHaveBeenCalledWith("SIGKILL");expect(mock.spawn).toHaveBeenCalledOnce();
});
it("kills oversized output before buffering or deserializing the full response",async()=>{
  const worker=child(),pending=parseResumeDocument(Buffer.from("synthetic"),".pdf");
  const rejected=expect(pending).rejects.toMatchObject({statusCode:503});
  worker.stdout.write(Buffer.alloc(512001));await rejected;expect(worker.kill).toHaveBeenCalledWith("SIGKILL");
  const [program,args,options]=mock.spawn.mock.calls[0];
  expect(program).toBe(process.execPath);expect(args).toContain("--max-old-space-size=192");
  expect(options.env).not.toHaveProperty("DATABASE_URL");expect(options.env).not.toHaveProperty("ENCRYPTION_KEY");
});
