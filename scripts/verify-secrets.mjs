import "dotenv/config";
import {readdir,readFile} from "node:fs/promises";
import {resolve} from "node:path";
const keys=[process.env.GEMINI_API_KEY, process.env.OPENCODE_ZEN_API_KEY, process.env.OPENCODE_API_KEY].filter(Boolean);
let checked=0,leaked=false;
async function check(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())await check(path);else{checked++;const content=await readFile(path);if(keys.some(key=>content.includes(Buffer.from(key))))leaked=true;}}}
await check(resolve("dist"));
const ignored=(await readFile(".gitignore","utf8")).split(/\r?\n/).includes(".env");
console.log(JSON.stringify({frontendFilesChecked:checked,configuredSecretFoundInFrontend:leaked,environmentFileIgnored:ignored}));
if(leaked || !ignored)process.exitCode=1;
