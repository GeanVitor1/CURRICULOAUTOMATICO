import { describe, expect, it } from "vitest";
import {
  appOrigins,
  googleOAuthConfig,
  hostedOnVercel,
  requirePersistentDatabase,
  secureAuthCookies,
  validateHostedRuntime,
} from "../server/auth-config";

const credentials = {
  GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "private-fixture-secret",
};
const production = {
  ...credentials,
  NODE_ENV: "production",
  APP_ORIGIN: "https://empregatos.example",
};

describe("Configuração de autenticação pública", () => {
  it("aceita Firestore na Vercel sem PostgreSQL e exige identidade do servidor", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      DATABASE_PROVIDER: "firestore",
      FIREBASE_PROJECT_ID: "example-project",
    };
    expect(() => requirePersistentDatabase(env)).toThrow("Vercel ao Firestore");
    expect(() =>
      requirePersistentDatabase({
        ...env,
        GCP_WORKLOAD_IDENTITY_AUDIENCE:
          "//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/p/providers/p",
        GCP_SERVICE_ACCOUNT_EMAIL:
          "app@example-project.iam.gserviceaccount.com",
      }),
    ).not.toThrow();
    expect(() =>
      requirePersistentDatabase({ ...env, FIREBASE_PROJECT_ID: "" }),
    ).toThrow("projeto Firebase");
  });
  it("deriva o callback HTTPS do domínio público sem configuração por computador", () => {
    expect(googleOAuthConfig(production)?.redirectUri).toBe(
      "https://empregatos.example/api/auth/google/callback",
    );
    expect(
      appOrigins({
        ...production,
        APP_ORIGIN:
          " https://empregatos.example/ , https://www.empregatos.example ",
      }),
    ).toEqual(["https://empregatos.example", "https://www.empregatos.example"]);
  });
  it("usa o domínio de produção da Vercel e aceita um domínio próprio explícito", () => {
    const env = {
      ...credentials,
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "empregatos.vercel.app",
      VERCEL_URL: "empregatos-random.vercel.app",
    };
    expect(googleOAuthConfig(env)?.redirectUri).toBe(
      "https://empregatos.vercel.app/api/auth/google/callback",
    );
    expect(
      googleOAuthConfig({ ...env, APP_ORIGIN: "https://empregatos.example" })
        ?.origin,
    ).toBe("https://empregatos.example");
    expect(secureAuthCookies({ ...env, NODE_ENV: "development" })).toBe(true);
  });
  it("separa URLs de preview e produção e mantém desenvolvimento local", () => {
    expect(
      appOrigins({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "preview.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "production.vercel.app",
      }),
    ).toEqual(["https://preview.vercel.app"]);
    expect(
      googleOAuthConfig({ ...credentials, NODE_ENV: "development" })
        ?.redirectUri,
    ).toBe("http://127.0.0.1:5173/api/auth/google/callback");
    expect(hostedOnVercel({ VERCEL: "1", VERCEL_ENV: "development" })).toBe(
      false,
    );
  });
  it.each([
    "http://empregatos.example",
    "http://127.0.0.1:5173",
    "https://localhost",
    "https://person:secret@empregatos.example",
    "https://empregatos.example/app",
    "https://empregatos.example?redirect=other",
    "https://empregatos.example#section",
  ])("recusa origem de produção inválida: %s", (APP_ORIGIN) => {
    expect(googleOAuthConfig({ ...production, APP_ORIGIN })).toBeNull();
  });
  it.each([
    "https://other.example/api/auth/google/callback",
    "https://empregatos.example/wrong",
    "https://empregatos.example/api/auth/google/callback?extra=1",
    "https://empregatos.example/api/auth/google/callback#fragment",
    "https://person:secret@empregatos.example/api/auth/google/callback",
  ])(
    "recusa callback que não corresponde ao domínio e caminho: %s",
    (GOOGLE_REDIRECT_URI) => {
      expect(
        googleOAuthConfig({ ...production, GOOGLE_REDIRECT_URI }),
      ).toBeNull();
    },
  );
  it("mantém callbacks explícitos cadastrados em uma das origens permitidas", () => {
    expect(
      googleOAuthConfig({
        ...production,
        APP_ORIGIN: "https://empregatos.example,https://www.empregatos.example",
        GOOGLE_REDIRECT_URI:
          " https://www.empregatos.example/api/auth/google/callback ",
      })?.origin,
    ).toBe("https://www.empregatos.example");
  });
  it("não usa localhost como fallback em produção ou configura login sem credenciais", () => {
    expect(appOrigins({ NODE_ENV: "production" })).toEqual([]);
    expect(
      googleOAuthConfig({ ...credentials, NODE_ENV: "production" }),
    ).toBeNull();
    expect(
      googleOAuthConfig({ ...production, GOOGLE_CLIENT_SECRET: "" }),
    ).toBeNull();
  });
  it("exige persistência de contas na Vercel e uma chave de criptografia estável", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      APP_ORIGIN: production.APP_ORIGIN,
    };
    expect(() => requirePersistentDatabase(env)).toThrow("DATABASE_URL");
    expect(() =>
      validateHostedRuntime({ ...env, DATABASE_URL: "postgres://fixture" }),
    ).toThrow("ENCRYPTION_KEY");
    expect(() =>
      validateHostedRuntime({
        ...env,
        DATABASE_URL: "postgres://fixture",
        ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      }),
    ).not.toThrow();
    expect(() =>
      requirePersistentDatabase({ NODE_ENV: "development" }),
    ).not.toThrow();
  });
});
