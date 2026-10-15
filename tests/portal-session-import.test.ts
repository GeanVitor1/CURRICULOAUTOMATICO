import { expect, it } from "vitest";
import { validatePortalState } from "../server/portal-session-import";
const cookie = {
  name: "session",
  value: "fixture",
  domain: ".gupy.io",
  path: "/",
  expires: -1,
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
};
it("aceita apenas a sessão do portal escolhido e não permite sessão Google ou do painel", () => {
  const state = {
    cookies: [cookie],
    origins: [
      {
        origin: "https://login.gupy.io",
        localStorage: [{ name: "auth-token", value: "fixture" }],
      },
    ],
  };
  expect(validatePortalState("gupy", state)).toEqual(state);
  for (const domain of [
    ".google.com",
    "curriculoautomatico.vercel.app",
    "gupy.io.evil.test",
    "127.0.0.1",
  ])
    expect(() =>
      validatePortalState("gupy", {
        ...state,
        cookies: [{ ...cookie, domain }],
      }),
    ).toThrow();
  expect(() => validatePortalState("infojobs", state)).toThrow();
  expect(() => validatePortalState("linkedin", state)).toThrow();
  expect(() =>
    validatePortalState("gupy", { cookies: [], origins: [] }),
  ).toThrow();
  expect(() =>
    validatePortalState("gupy", {
      ...state,
      origins: [
        { origin: "https://login.gupy.io/candidates", localStorage: [] },
      ],
    }),
  ).toThrow();
});
