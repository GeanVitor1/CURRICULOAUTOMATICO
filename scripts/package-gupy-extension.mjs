import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
const root = new URL('../browser-extension/gupy-session/', import.meta.url);
const files = {};
for (const name of await readdir(root)) files[name] = new Uint8Array(await readFile(new URL(name,root)));
const output = new URL('../public/downloads/',import.meta.url);
await mkdir(output,{recursive:true});
await writeFile(new URL('empregatos-gupy-chrome.zip',output),zipSync(files));
