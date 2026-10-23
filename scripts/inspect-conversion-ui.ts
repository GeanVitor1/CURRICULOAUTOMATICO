import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {createWorkspace} from '../server/workspace';
const w=createWorkspace('Pessoa QA','fixture@example.test');
w.onboarding!.completed=true;w.guide={step:0,completed:true,active:false,dismissed:true};w.revision='qa';
const snapshot=JSON.parse(await readFile('artifacts/submission-channel-yield-2026-10-23.json','utf8')).conversion;
const browser=await chromium.launch({headless:true});
try{
 const results=[];
 for(const width of [1440,375]){
  const page=await browser.newPage({viewport:{width,height:1100}});
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/auth/me')return route.fulfill({json:{id:'qa',name:'Pessoa QA',email:w.profile.email}});
   if(path==='/api/workspace')return route.fulfill({json:w});
   if(path==='/api/workspace/version')return route.fulfill({json:{revision:'qa'}});
   if(path==='/api/automation/conversion')return route.fulfill({json:snapshot});
   if(path==='/api/automation/sites')return route.fulfill({json:[]});
   return route.fulfill({json:{}});
  });
  await page.goto('http://127.0.0.1:5180/app#automacao');
  await page.getByText('Indicadores técnicos da automação',{exact:true}).click();
  await page.getByRole('table').first().waitFor({state:'visible'});
  await page.getByText('Indicadores técnicos da automação',{exact:true}).scrollIntoViewIfNeeded();
  const path=`artifacts/conversion-indicators-${width}-2026-10-23.png`;
  await page.screenshot({path,fullPage:true});
  results.push({width,tableCount:await page.getByRole('table').count(),pageWidth:await page.evaluate(()=>document.documentElement.scrollWidth),fixtureIdentityOnly:true,path});await page.close();
 }
 await writeFile('artifacts/conversion-ui-2026-10-23.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
