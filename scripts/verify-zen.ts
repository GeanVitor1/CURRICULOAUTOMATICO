import "dotenv/config";
import { z } from "zod";

// Connectivity diagnostic uses synthetic professional facts only; no database or resume is read.
const base = "https://opencode.ai/zen/v1";
const key = process.env.OPENCODE_ZEN_API_KEY || process.env.OPENCODE_API_KEY;
const catalogSchema = z.object({ data: z.array(z.object({ id: z.string() })) });
try {
  const response = await fetch(`${base}/models`, {
    signal: AbortSignal.timeout(15000),
    ...(key ? { headers: { Authorization: `Bearer ${key}` } } : {}),
  });
  if (!response.ok)
    throw new Error(`Catálogo indisponível (HTTP ${response.status}).`);
  const catalog = catalogSchema.parse(await response.json());
  const eligible = catalog.data.filter(
    (m) =>
      (m.id.endsWith("-free") || m.id === "big-pickle") &&
      !/nemotron|jev|muse-spark/.test(m.id),
  );
  const report = {
    provider: "OpenCode Zen",
    catalogReachable: true,
    availableModels: catalog.data.length,
    eligibleFreeModels: eligible.map((m) => m.id),
    keyConfigured: !!key,
    authenticatedAnalysisVerified: false,
    message:
      "Configure OPENCODE_ZEN_API_KEY no servidor para verificar a análise autenticada.",
  };
  if (key) {
    const model =
      process.env.OPENCODE_ZEN_MODEL ||
      (eligible.some((m) => m.id === "ling-3.1-flash-free")
        ? "ling-3.1-flash-free"
        : eligible[0]?.id);
    if (!model || !eligible.some((m) => m.id === model))
      throw new Error(
        "Modelo configurado não disponível ou não elegível para currículos.",
      );
    const chat = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(25000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: 160,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Retorne somente JSON com {"skills": [strings]}. Extraia apenas as competências explicitamente citadas.',
          },
          {
            role: "user",
            content:
              "Exemplo sintético sem dados pessoais: atendimento ao público e organização de estoque.",
          },
        ],
      }),
    });
    if (!chat.ok)
      throw new Error(
        `Análise autenticada indisponível (HTTP ${chat.status}).`,
      );
    const output = z
      .object({
        choices: z
          .array(
            z.object({
              finish_reason: z.string(),
              message: z.object({ content: z.string() }),
            }),
          )
          .min(1),
      })
      .parse(await chat.json());
    if (output.choices[0].finish_reason !== "stop")
      throw new Error("Análise autenticada não concluída.");
    z.object({ skills: z.array(z.string()).min(1).max(10) }).parse(
      JSON.parse(output.choices[0].message.content),
    );
    report.authenticatedAnalysisVerified = true;
    report.message = `Análise autenticada com saída JSON válida: ${model}. Exemplo sintético, sem currículo ou dados pessoais.`;
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  // Never print upstream bodies, request headers, environment values, or secrets.
  console.error(
    JSON.stringify({
      provider: "OpenCode Zen",
      keyConfigured: !!key,
      authenticatedAnalysisVerified: false,
      message:
        error instanceof Error &&
        /^Catálogo|^Análise|^Modelo/.test(error.message)
          ? error.message
          : "Falha de conectividade ou de validação da resposta.",
    }),
  );
  process.exitCode = 1;
}
