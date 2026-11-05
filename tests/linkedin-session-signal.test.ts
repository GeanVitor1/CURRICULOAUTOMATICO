import {beforeAll,afterAll,it,expect} from 'vitest';
import {chromium,type Browser} from 'playwright';
import {authenticated} from '../server/portal-application';
import {browserConnectors} from '../shared/browser-connectors';

let browser:Browser;
beforeAll(async()=>{browser=await chromium.launch({headless:true});});
afterAll(async()=>{await browser?.close();});
const menu='<button aria-expanded="false"><img width="20" height="20" alt="">Eu</button>';
const messages='<a href="/messaging/">Mensagens</a>';
const network='<a href="/mynetwork/">Rede</a>';
it.each([
 {name:'current feed observed in the real browser',html:menu+messages+network,signed:true},
 {name:'legacy feed',html:'<div class="global-nav__me">Eu</div>',signed:true},
 {name:'a public avatar without private navigation',html:menu,signed:false},
 {name:'private navigation without the account menu',html:messages+network,signed:false},
 {name:'an avatar and only one private-navigation link',html:menu+messages,signed:false},
 {name:'a hidden account menu',html:messages+network+'<div hidden>'+menu+'</div>',signed:false},
 {name:'the login route even if a menu is rendered',html:menu+messages+network,path:'/login',signed:false},
])('recognizes $name without treating a public or hidden avatar as a connected account',async fixture=>{
 const page=await browser.newPage();
 try{
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fixture.html}));
  await page.goto('https://www.linkedin.com'+(fixture.path||'/feed/foryou/'));
  expect(await authenticated(page,'linkedin')).toBe(fixture.signed);
  if(fixture.signed)expect(await page.locator(browserConnectors.linkedin.signedSelector).count()).toBeGreaterThan(0);
 }finally{await page.close();}
});
