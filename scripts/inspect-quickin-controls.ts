import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const b=await chromium.launch({headless:true});
try{const p=await b.newPage();await p.goto('https://jobs.quickin.io/globalti/jobs/6ad64c6582963200138f28c0/apply',{waitUntil:'networkidle'});
 const output={url:p.url(),controls:await p.locator('input,textarea,select,button,[role="combobox"],[role="listbox"]').evaluateAll(ns=>ns.map(n=>n.outerHTML)),labels:await p.locator('label').allTextContents()};
 await writeFile('.data/quickin-controls.json',JSON.stringify(output,null,2));console.log(JSON.stringify({inspected:true,controls:output.controls.length}));
}finally{await b.close();}
