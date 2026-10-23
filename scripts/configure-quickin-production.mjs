import {readFile,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';
const cache=join(homedir(),'AppData/Local/npm-cache/_npx');let cli;
for(const d of await readdir(cache)){const path=join(cache,d,'node_modules/vercel/dist/index.js');try{await readFile(path);cli=path;break;}catch{}}
if(!cli)throw Error('Authenticated CLI unavailable');
for(const [name,value] of Object.entries({DISCOVERY_QUICKIN_BOARDS:JSON.stringify([{company:'Global TI',board:'globalti'}]),ATS_BROWSER_AUTHORIZED:'quickin:globalti'})){
 const args=['env','update',name,'--environment','production','--value',value,'--yes','--scope','team_bHYZKgxVXE5lhNnvsiDlLvyR'];
 const child=spawn(process.execPath,[cli,...args],{windowsHide:true,stdio:'inherit'});
 const code=await new Promise(resolve=>child.on('exit',resolve));if(code!==0)throw Error('Production configuration update failed');
}
