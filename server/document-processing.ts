import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { RequestError } from "./errors";
import { PdfReaderUnavailableError } from "./pdf-text";
import { assertSecureNode } from "./runtime-security";

const execute = promisify(execFile);
let active = 0;
export const PARSER_MEMORY_BYTES = 384 * 1024 * 1024;
export const PARSER_TIMEOUT_MS = 15000;
const unavailable = () => Object.assign(new Error("O processamento de documentos atingiu o limite de recursos. Tente novamente em instantes."),{statusCode:503,code:"DOCUMENT_PROCESSING_LIMIT"});

export async function parserMemoryBytes(pid: number): Promise<number> {
  if (!Number.isSafeInteger(pid) || pid < 1) throw Error("Invalid parser process");
  if (process.platform === "linux") {
    const status = await readFile(`/proc/${pid}/status`,"utf8");
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
    if (!match) throw Error("Parser memory unavailable");
    return Number(match[1])*1024;
  }
  if (process.platform === "win32") {
    const {stdout} = await execute("tasklist.exe",["/FI",`PID eq ${pid}`,"/FO","CSV","/NH"],{windowsHide:true,timeout:1500,maxBuffer:16384});
    const match = stdout.match(/"([\d.,\s]+)\s*K"\s*$/m);
    if (!match) throw Error("Parser memory unavailable");
    return Number(match[1].replace(/\D/g,""))*1024;
  }
  throw Error("Unsupported parser isolation platform");
}

/** Disposable process, bounded input/output, wall time, JS heap and monitored RSS. */
export async function parseResumeDocument(bytes: Buffer, extension: ".pdf" | ".docx"): Promise<string> {
  assertSecureNode();
  if (!bytes.length || bytes.length > 5*1024*1024) throw new RequestError("Documento inválido ou maior que 5 MB.");
  if (active >= 1) throw unavailable();
  active++;
  try {
    const production = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    const worker = fileURLToPath(new URL(production ? "./document-parser-worker.mjs" : "../dist-server/document-parser-worker.mjs",import.meta.url));
    const args = ["--max-old-space-size=192",worker,extension];
    // Never give a parser database credentials, OAuth tokens or the service environment.
    const env: NodeJS.ProcessEnv = {};
    for (const name of ["PATH","Path","SystemRoot","WINDIR","TEMP","TMP","LOCALAPPDATA"]) if (process.env[name]) env[name]=process.env[name];
    return await new Promise<string>((resolve,reject) => {
      const child = spawn(process.execPath,args,{cwd:tmpdir(),env,windowsHide:true,stdio:["pipe","pipe","ignore"]});
      const chunks: Buffer[] = []; let size=0, done=false, monitoring=false;
      const finish = (error?: Error, text?: string) => {
        if (done) return; done=true; clearTimeout(deadline); clearInterval(memory);
        child.kill("SIGKILL");
        if (error) reject(error); else resolve(text!);
      };
      const checkMemory = async () => {
        if (done || monitoring || !child.pid) return;
        monitoring=true;
        try { if (await parserMemoryBytes(child.pid) > PARSER_MEMORY_BYTES) finish(unavailable()); }
        catch { if (!done) finish(unavailable()); }
        finally { monitoring=false; }
      };
      const deadline = setTimeout(()=>finish(unavailable()),PARSER_TIMEOUT_MS);
      const memory = setInterval(()=>void checkMemory(),300);
      child.on("error",()=>finish(unavailable()));
      child.stdin.on("error",()=>{});
      child.stdout.on("data",(part: Buffer)=>{
        size+=part.length;
        if (size>512000) { finish(unavailable()); return; }
        chunks.push(part);
      });
      child.on("close",code=>{
        if (done) return;
        if (code !== 0) { finish(unavailable()); return; }
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (result.error === "PDF_READER_UNAVAILABLE") { finish(new PdfReaderUnavailableError()); return; }
          if (typeof result.text !== "string" || result.text.length>100000) { finish(new RequestError("Não foi possível ler este documento. Use um PDF com texto selecionável ou DOCX.")); return; }
          finish(undefined,result.text);
        } catch { finish(unavailable()); }
      });
      void checkMemory().then(()=>{ if (!done) child.stdin.end(bytes); });
    });
  } finally { active--; }
}
