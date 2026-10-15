import { readFile, readdir, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
const files = {};
for (const name of await readdir("browser-connector"))
  files[name] = new Uint8Array(await readFile("browser-connector/" + name));
await writeFile("public/empregatos-conector.zip", zipSync(files));
console.log("Conector de portais empacotado sem credenciais.");
