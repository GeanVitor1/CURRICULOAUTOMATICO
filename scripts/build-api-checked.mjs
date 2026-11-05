import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[require.resolve("typescript/bin/tsc"),"--noEmit"],{stdio:"inherit",windowsHide:true});
  child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(Error("Falha na tipagem.")));
});
await import("./build-api.mjs");
