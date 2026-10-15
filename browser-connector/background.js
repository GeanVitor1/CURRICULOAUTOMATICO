const portals = {
  gupy: { name: "Gupy", roots: ["gupy.io"] },
  infojobs: { name: "InfoJobs", roots: ["infojobs.com.br"] },
  glassdoor: {
    name: "Glassdoor",
    roots: ["glassdoor.com", "glassdoor.com.br"],
  },
};
const allowed = new Set([
  "https://curriculoautomatico.vercel.app",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
]);
const pending = new Map();
function finish(id, result) {
  const item = pending.get(id);
  if (!item) return false;
  pending.delete(id);
  clearTimeout(item.timer);
  try {
    item.reply(result);
  } catch {
    /* Page closed: discard the session. */
  }
  return true;
}
chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
  let origin;
  try {
    origin = new URL(sender.url).origin;
  } catch {
    return false;
  }
  if (!allowed.has(origin) || sender.frameId !== 0 || !sender.tab?.id)
    return false;
  if (message?.type === "empregatos:ping") {
    reply({ version: 1 });
    return false;
  }
  if (message?.type !== "empregatos:connect" || !portals[message.portal])
    return false;
  if ([...pending.values()].some((p) => p.tabId === sender.tab.id)) {
    reply({
      ok: false,
      error: "Já existe uma autorização aberta. Conclua ou feche essa janela.",
    });
    return false;
  }
  const id = crypto.randomUUID();
  const item = {
    reply,
    portal: message.portal,
    origin,
    tabId: sender.tab.id,
    timer: setTimeout(
      () =>
        finish(id, {
          ok: false,
          error: "A autorização expirou. Clique em conectar novamente.",
        }),
      150000,
    ),
  };
  pending.set(id, item);
  chrome.windows
    .create({
      url: chrome.runtime.getURL("connect.html#" + id),
      type: "popup",
      width: 520,
      height: 690,
    })
    .then((w) => {
      item.windowId = w.id;
    })
    .catch(() =>
      finish(id, {
        ok: false,
        error: "Não foi possível abrir a autorização do conector.",
      }),
    );
  return true;
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!sender.url?.startsWith(chrome.runtime.getURL("connect.html")))
    return false;
  const item = pending.get(message.id);
  if (!item) {
    reply({
      ok: false,
      error: "Esta autorização expirou. Volte ao painel e tente novamente.",
    });
    return false;
  }
  if (message.type === "context")
    reply({
      ok: true,
      portal: item.portal,
      name: portals[item.portal].name,
      roots: portals[item.portal].roots,
      origin: item.origin,
    });
  else if (message.type === "finish") {
    finish(message.id, { ok: true, state: message.state });
    reply({ ok: true });
  } else if (message.type === "cancel") {
    finish(message.id, {
      ok: false,
      error: "Conexão cancelada. Sua sessão não foi compartilhada.",
    });
    reply({ ok: true });
  }
  return false;
});
chrome.windows.onRemoved.addListener((windowId) => {
  for (const [id, item] of pending)
    if (item.windowId === windowId)
      finish(id, {
        ok: false,
        error: "Autorização fechada. Nenhuma nova conexão foi criada.",
      });
});
chrome.action.onClicked.addListener(() =>
  chrome.tabs.create({
    url: "https://curriculoautomatico.vercel.app/app#automacao",
  }),
);
