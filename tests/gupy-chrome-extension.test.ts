import { expect, it } from "vitest";
import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

it("a extensão real transfere apenas a sessão Gupy após consentimento, pela API autenticada", async () => {
  const directory = await mkdtemp(join(tmpdir(),"gupy-extension-test-"));
  const extension = resolve("browser-extension/gupy-session");
  const context = await chromium.launchPersistentContext(directory, {
    channel:"chromium", headless:true,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
  });
  let received: any;
  context.setDefaultTimeout(5000);
  try {
    await context.route('https://**/*',async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'login.gupy.io') return route.fulfill({contentType:'text/html; charset=utf-8',body:'<div id="header-message-icon"></div><button>Menu</button><script>localStorage.setItem("candidateToken","fixture-gupy-token");localStorage.setItem("unrelatedPreference","not-exported")</script>'});
      if (url.hostname === 'curriculoautomatico.vercel.app' && url.pathname === '/app') return route.fulfill({contentType:'text/html; charset=utf-8',body:'<p>EmpreGatos fixture</p><div id="result"></div><script>addEventListener("message",e=>{if(e.data.type==="empregatos:gupy-browser-session")document.getElementById("result").textContent="Sessão verificada"})</script>'});
      if (url.pathname === '/api/connections/gupy/browser-session') {
        received = {body:route.request().postDataJSON(),headers:await route.request().allHeaders()};
        return route.fulfill({contentType:'application/json',body:JSON.stringify({viewerId:'fixture',authenticated:true,image:'data:image/png;base64,AA=='})});
      }
      return route.abort();
    });
    await context.addCookies([
      {name:'candidate_session',value:'fixture-gupy-cookie',domain:'.gupy.io',path:'/',httpOnly:true,secure:true,sameSite:'Lax'},
      {name:'google_session',value:'never-export-google',domain:'.google.com',path:'/',httpOnly:true,secure:true,sameSite:'Lax'},
      {name:'app_session',value:'fixture-app-session',domain:'curriculoautomatico.vercel.app',path:'/',httpOnly:true,secure:true,sameSite:'Lax'},
    ]);
    const gupy = await context.newPage();
    await gupy.goto('https://login.gupy.io/candidates/applications');
    const app = await context.newPage();
    await app.goto('https://curriculoautomatico.vercel.app/app?portal=gupy');
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:5000});
    const id = new URL(worker.url()).hostname;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    expect(await popup.getByRole('button',{name:'Conectar sessão da Gupy'}).isDisabled()).toBe(true);
    expect(received).toBeUndefined();
    await popup.getByRole('checkbox').check();
    await popup.getByRole('button',{name:'Conectar sessão da Gupy'}).click();
    await popup.getByRole('status').filter({hasText:'Sessão verificada.'}).waitFor();
    expect(await app.locator('#result').innerText()).toBe('Sessão verificada');
    expect(received.body.authorizeSessionTransfer).toBe(true);
    expect(received.headers['x-orbita-request']).toBe('1');
    expect(received.headers.cookie).toContain('app_session=fixture-app-session');
    expect(received.body.state.cookies.map((c:any)=>c.name)).toEqual(['candidate_session']);
    expect(received.body.state.origins).toEqual([{origin:'https://login.gupy.io',localStorage:[{name:'candidateToken',value:'fixture-gupy-token'}]}]);
    expect(JSON.stringify(received.body)).not.toContain('never-export-google');
  } finally {
    await context.close();
    await rm(directory,{recursive:true,force:true});
  }
}, 30000);
