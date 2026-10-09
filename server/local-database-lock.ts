import { randomUUID } from "node:crypto";
import { open, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

export async function lockLocalDatabase(directory: string) {
  const path = resolve(directory, "local-database.lock");
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, "wx", 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, token }));
      await handle.close();
      return async () => {
        const owner = JSON.parse(await readFile(path, "utf8"));
        if (owner.token === token) await rm(path, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const owner = await readFile(path, "utf8")
        .then((text) => JSON.parse(text))
        .catch(() => null);
      if (!Number.isSafeInteger(owner?.pid) || owner.pid < 1)
        throw new Error(
          "A trava do banco local precisa ser verificada antes de iniciar outro processo.",
        );
      let alive = true;
      try {
        process.kill(owner.pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
      }
      if (alive)
        throw new Error(
          "O banco local já está aberto em outro processo. Use somente uma API por diretório de dados.",
        );
      const cleanupPath = path + ".recovery";
      const cleanup = await open(cleanupPath, "wx", 0o600).catch(() => {
        throw new Error(
          "Outro processo está verificando a trava do banco local. Tente novamente em instantes.",
        );
      });
      try {
        // Serialize stale-lease cleanup and recheck ownership before removing it.
        const current = await readFile(path, "utf8")
          .then((text) => JSON.parse(text))
          .catch(() => null);
        if (current?.token !== owner.token || current?.pid !== owner.pid)
          continue;
        await rm(path, { force: true });
      } finally {
        await cleanup.close();
        await rm(cleanupPath, { force: true });
      }
    }
  }
  throw new Error("Não foi possível reservar o banco local para esta API.");
}
