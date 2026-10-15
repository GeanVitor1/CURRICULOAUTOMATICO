const id = location.hash.slice(1);
const context = await chrome.runtime.sendMessage({ type: "context", id });
const status = document.querySelector("#status"),
  button = document.querySelector("#connect"),
  consent = document.querySelector("#consent");
document.querySelector("#portal").textContent = context.name || "";
document.querySelector("#destination").textContent = context.origin || "";
if (!context.ok) status.textContent = context.error;
consent.addEventListener("change", () => {
  button.disabled = !context.ok || !consent.checked;
});
document.querySelector("#cancel").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "cancel", id });
  window.close();
});
function belongs(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      context.roots.some(
        (root) => u.hostname === root || u.hostname.endsWith("." + root),
      )
    );
  } catch {
    return false;
  }
}
// Runs in an authenticated official tab. Does not inspect DOM fields, passwords, forms or page text.
async function readAuthenticationStorage() {
  const local = [];
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i);
    if (
      /token|auth|session|cognito|firebase|oidc|oauth|login/i.test(name) &&
      !/password|senha/i.test(name)
    )
      local.push({ name, value: localStorage.getItem(name) });
  }
  const databases = [];
  if (
    indexedDB.databases &&
    (await indexedDB.databases()).some(
      (d) => d.name === "firebaseLocalStorageDb",
    )
  ) {
    const db = await new Promise((ok, fail) => {
      const r = indexedDB.open("firebaseLocalStorageDb");
      r.onsuccess = () => ok(r.result);
      r.onerror = () =>
        fail(Error("Não foi possível ler a sessão autenticada."));
    });
    try {
      if (db.objectStoreNames.contains("firebaseLocalStorage")) {
        const store = db
          .transaction("firebaseLocalStorage", "readonly")
          .objectStore("firebaseLocalStorage");
        const records = await new Promise((ok, fail) => {
          const rows = [],
            request = store.openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return ok(rows);
            const row = { value: cursor.value };
            if (store.keyPath === null) row.key = cursor.key;
            rows.push(row);
            cursor.continue();
          };
          request.onerror = () =>
            fail(Error("Não foi possível ler a sessão autenticada."));
        });
        databases.push({
          name: db.name,
          version: db.version,
          stores: [
            {
              name: store.name,
              keyPath: store.keyPath,
              autoIncrement: store.autoIncrement,
              indexes: [...store.indexNames].map((name) => {
                const index = store.index(name);
                return {
                  name,
                  keyPath: index.keyPath,
                  unique: index.unique,
                  multiEntry: index.multiEntry,
                };
              }),
              records,
            },
          ],
        });
      }
    } finally {
      db.close();
    }
  }
  return {
    origin: location.origin,
    localStorage: local,
    ...(databases.length ? { indexedDB: databases } : {}),
  };
}
button.addEventListener("click", async () => {
  if (!context.ok || !consent.checked) return;
  button.disabled = true;
  status.textContent = "Aguardando a permissão do navegador…";
  try {
    // The browser permission prompt is requested directly from this explicit user click.
    const origins = context.roots.map((root) => "https://*." + root + "/*");
    if (
      !(await chrome.permissions.request({
        permissions: ["cookies", "scripting"],
        origins,
      }))
    )
      throw Error("Permissão recusada. Nenhuma sessão foi compartilhada.");
    const cookies = (
      await Promise.all(
        context.roots.map((domain) => chrome.cookies.getAll({ domain })),
      )
    )
      .flat()
      .filter((c) => c.secure && !c.partitionKey)
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.session ? -1 : c.expirationDate,
        httpOnly: c.httpOnly,
        secure: true,
        sameSite:
          c.sameSite === "strict"
            ? "Strict"
            : c.sameSite === "lax"
              ? "Lax"
              : "None",
      }));
    const tabs = (await chrome.tabs.query({ url: origins })).filter(
      (t) => !t.incognito && belongs(t.url),
    );
    const states = new Map();
    for (const tab of tabs) {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readAuthenticationStorage,
      });
      if (result[0]?.result && belongs(result[0].result.origin))
        states.set(result[0].result.origin, result[0].result);
    }
    const state = { cookies, origins: [...states.values()] };
    if (
      !cookies.length &&
      !state.origins.some((o) => o.localStorage.length || o.indexedDB?.length)
    )
      throw Error(
        "Entre no site oficial e mantenha essa aba aberta antes de conectar.",
      );
    if (JSON.stringify(state).length > 1000000)
      throw Error(
        "A sessão excede o limite. Tente conectar novamente após entrar no portal.",
      );
    const response = await chrome.runtime.sendMessage({
      type: "finish",
      id,
      state,
    });
    if (!response.ok) throw Error(response.error);
    status.textContent =
      "Sessão encaminhada. Volte ao painel para acompanhar a validação na nuvem.";
    document.querySelector("#cancel").textContent = "Fechar";
    consent.disabled = true;
  } catch (error) {
    status.textContent = error.message || "Não foi possível conectar.";
    button.disabled = !consent.checked;
  }
});
