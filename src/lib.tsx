import { createContext, useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "../shared/types";
export const Context = createContext<{
  w: Workspace;
  demo: boolean;
  navigate: (page: string) => void;
  toast: (message: string, error?: boolean) => void;
}>(null!);
export const useApp = () => useContext(Context);
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  demo = false,
): Promise<T> {
  const response = await fetch(
    `/api${path}${path.includes("?") ? "&" : "?"}demo=${demo}`,
    {
      ...options,
      headers: {
        ...(options.body === undefined || options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        "X-Orbita-Request": "1",
        ...options.headers,
      },
    },
  );
  const data = await response.json().catch(() => {
    throw new Error(
      "O serviço está temporariamente indisponível. Tente novamente em instantes.",
    );
  });
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Não foi possível concluir."), {
      status: response.status,
    });
  return data;
}
export function useAction() {
  const { demo, toast } = useApp();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) => {
      const cleaned =
        body && !(body instanceof FormData)
          ? JSON.parse(
              JSON.stringify(body, (_k, value) =>
                Array.isArray(value)
                  ? value.filter(
                      (v) => typeof v !== "string" || v.trim().length > 0,
                    )
                  : value,
              ),
            )
          : body;
      return api(
        path,
        {
          method,
          body:
            cleaned instanceof FormData
              ? cleaned
              : cleaned === undefined
                ? undefined
                : JSON.stringify(cleaned),
        },
        demo,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["workspace"] }),
        client.invalidateQueries({ queryKey: ["jobs"] }),
      ]);
    },
    onError: (e: Error) => toast(e.message, true),
  });
}
export const split = (s: string) => [
  ...new Set(
    s
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
export const date = (s: string | null | undefined, time = false) =>
  s
    ? new Date(s).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "short",
        ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "Ainda não executada";
export const money = (n: number | null, currency = "BRL") =>
  n === null
    ? "A combinar"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n);
export function salary(j: {
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  salaryPeriod?: string;
}) {
  return j.salaryMin === null
    ? "Salário não divulgado"
    : `${money(j.salaryMin, j.currency)}${j.salaryMax ? ` – ${money(j.salaryMax, j.currency)}` : ""}${j.salaryPeriod ? ` / ${j.salaryPeriod}` : ""}`;
}
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const isToday = (s: string) =>
  new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) ===
  today();
export const submitted = (status: string) =>
  [
    "Enviada",
    "Aguardando resposta",
    "Em entrevista",
    "Teste técnico",
    "Proposta recebida",
    "Rejeitada",
    "Contratada",
  ].includes(status);
