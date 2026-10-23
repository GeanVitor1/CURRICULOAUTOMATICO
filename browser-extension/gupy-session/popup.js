const consent = document.querySelector('#consent');
const connect = document.querySelector('#connect');
const status = document.querySelector('#status');
consent.addEventListener('change', () => { connect.disabled = !consent.checked; });
connect.addEventListener('click', async () => {
  if (!consent.checked) return;
  connect.disabled = true;
  status.textContent = 'Verificando sua sessão. Mantenha esta janela aberta…';
  try {
    const appTabs = await chrome.tabs.query({url:'https://curriculoautomatico.vercel.app/app*'});
    const app = appTabs.find(tab => new URL(tab.url).searchParams.get('portal') === 'gupy');
    if (!app) throw new Error('Abra a tela Conectar Gupy no EmpreGatos e tente novamente.');
    const tabs = await chrome.tabs.query({url:'https://*.gupy.io/*'});
    const origins = new Map();
    let authenticated = false;
    for (const tab of tabs) {
      const url = new URL(tab.url);
      if (!/^\/candidates\/(?:applications|profile|curriculum)(?:\/|$)/.test(url.pathname)) continue;
      const results = await chrome.scripting.executeScript({target:{tabId:tab.id}, func:() => {
        // Runs only on private Gupy candidate pages. No password/input fields are read.
        const signed = !!document.querySelector('#header-message-icon, a[href*="logout"], a[href*="signout"]') ||
          [...document.querySelectorAll('button')].some(b => /^(Sair|Logout)$/i.test(b.textContent.trim()));
        if (!signed) return null;
        const local = [];
        for (let i=0; i<localStorage.length; i++) {
          const name = localStorage.key(i);
          if (/token|auth|session/i.test(name)) local.push({name,value:localStorage.getItem(name)});
        }
        return {origin:location.origin, localStorage:local};
      }});
      const state = results[0]?.result;
      if (state) { authenticated = true; origins.set(state.origin,state); }
    }
    if (!authenticated) throw new Error('Abra Minhas candidaturas na Gupy e faça login antes de conectar.');
    const cookies = (await chrome.cookies.getAll({domain:'gupy.io'}))
      .filter(c => /^(?:[a-z0-9-]+\.)*gupy\.io$/.test(c.domain.replace(/^\./,'')) && c.secure && !c.partitionKey)
      .map(c => ({name:c.name,value:c.value,domain:c.domain,path:c.path,expires:c.expirationDate ?? -1,
        httpOnly:c.httpOnly,secure:true,sameSite:c.sameSite === 'strict' ? 'Strict' : c.sameSite === 'lax' ? 'Lax' : 'None'}));
    const result = await chrome.tabs.sendMessage(app.id,{type:'empregatos:import-gupy',state:{cookies,origins:[...origins.values()]}});
    if (!result?.ok) throw new Error(result?.error || 'Recarregue a aba do EmpreGatos após instalar a extensão.');
    status.textContent = 'Sessão verificada. Volte ao EmpreGatos para conferir o currículo e confirmar a conexão.';
  } catch (error) { status.textContent = error.message; connect.disabled = false; }
});
