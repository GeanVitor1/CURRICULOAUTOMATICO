chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "empregatos:import-gupy") return;
  if (location.origin !== "https://curriculoautomatico.vercel.app" || location.pathname !== "/app") {
    respond({error:"Abra a tela de conexão da Gupy no EmpreGatos."}); return;
  }
  fetch("/api/connections/gupy/browser-session", {
    method:"POST", credentials:"same-origin", cache:"no-store",
    headers:{"Content-Type":"application/json", "X-Orbita-Request":"1"},
    body:JSON.stringify({authorizeSessionTransfer:true, state:message.state}),
  }).then(async response => {
    const frame = await response.json();
    if (!response.ok) throw new Error(frame.error || "Não foi possível verificar a sessão da Gupy.");
    window.postMessage({type:"empregatos:gupy-browser-session", frame},location.origin);
    respond({ok:true});
  }).catch(error => respond({error:error.message}));
  return true;
});
