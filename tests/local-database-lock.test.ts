import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lockLocalDatabase } from "../server/local-database-lock";
import { spawnSync } from "node:child_process";

describe("Um único processo para o banco local", () => {
  it("libera a trava deixada por um processo que já terminou", async () => {
    const dir = await mkdtemp(join(tmpdir(), "empregatos-db-lock-"));
    try {
      const child = spawnSync(process.execPath, ["-e", "process.exit(0)"], {
        windowsHide: true,
      });
      expect(child.status).toBe(0);
      await writeFile(
        join(dir, "local-database.lock"),
        JSON.stringify({ pid: child.pid, token: "terminated-process" }),
      );
      await (
        await lockLocalDatabase(dir)
      )();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("impede abrir duas APIs no mesmo banco e permite reabrir depois do fechamento", async () => {
    const dir = await mkdtemp(join(tmpdir(), "empregatos-db-lock-"));
    try {
      const release = await lockLocalDatabase(dir);
      await expect(lockLocalDatabase(dir)).rejects.toThrow("outro processo");
      await release();
      await (
        await lockLocalDatabase(dir)
      )();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("recusa uma trava ilegível em vez de liberar um banco potencialmente aberto", async () => {
    const dir = await mkdtemp(join(tmpdir(), "empregatos-db-lock-"));
    try {
      await writeFile(join(dir, "local-database.lock"), "invalid");
      await expect(lockLocalDatabase(dir)).rejects.toThrow("verificada");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
