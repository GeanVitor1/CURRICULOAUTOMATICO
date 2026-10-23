import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { gupyBrowserSessionSchema } from "../server/gupy-browser-session";

const state = {
  cookies: [{name:"candidate_session",value:"fake",domain:".gupy.io",path:"/",expires:-1,httpOnly:true,secure:true,sameSite:"Lax"}],
  origins: [{origin:"https://login.gupy.io",localStorage:[{name:"token",value:"fake"}]}],
};
describe("Conexão Gupy autorizada pelo Chrome", () => {
  it("aceita somente estado limitado à Gupy", () => {
    expect(gupyBrowserSessionSchema.parse(state)).toEqual(state);
    for (const domain of ["accounts.google.com","evilgupy.io","gupy.io.evil.test","localhost","127.0.0.1"])
      expect(gupyBrowserSessionSchema.safeParse({...state,cookies:[{...state.cookies[0],domain}]}).success).toBe(false);
    for (const origin of ["https://accounts.google.com","http://login.gupy.io","https://login.gupy.io/path","https://u:p@login.gupy.io"])
      expect(gupyBrowserSessionSchema.safeParse({...state,origins:[{...state.origins[0],origin}]}).success).toBe(false);
  });
  it("recusa senha, campos extras, sessão vazia e exportações excessivas", () => {
    for (const bad of [
      {cookies:[],origins:[]}, {...state,password:"secret"},
      {...state,cookies:[{...state.cookies[0],secure:false}]},
      {...state,cookies:[{...state.cookies[0],value:"x".repeat(32769)}]},
      {...state,cookies:Array(151).fill(state.cookies[0])},
    ]) expect(gupyBrowserSessionSchema.safeParse(bad).success).toBe(false);
  });
  it("o conector não pede acesso ao Google ou a todas as páginas", async () => {
    const manifest = JSON.parse(await readFile('browser-extension/gupy-session/manifest.json','utf8'));
    expect(manifest.permissions).toEqual(['cookies','scripting']);
    expect(manifest.host_permissions).toEqual(['https://*.gupy.io/*','https://curriculoautomatico.vercel.app/*']);
    expect(manifest.content_scripts[0].matches).toEqual(['https://curriculoautomatico.vercel.app/app*']);
  });
});
