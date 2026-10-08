import { z } from "zod";

export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;
export const geminiPrivacyUrl = "https://ai.google.dev/gemini-api/terms";

/** Keep provider constraints small; full lengths and numeric bounds are validated by Zod locally. */
export function geminiResponseSchema(value: unknown): any {
  if (Array.isArray(value)) return value.map(geminiResponseSchema);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "$schema",
              "maxLength",
              "minLength",
              "maxItems",
              "minItems",
              "minimum",
              "maximum",
              "exclusiveMinimum",
              "exclusiveMaximum",
              "pattern",
              "format",
            ].includes(key),
        )
        .map(([key, child]) => [key, geminiResponseSchema(child)]),
    );
  return value;
}

/** Server-only API key, with generic errors that never expose upstream credentials. */
export async function generateGemini(
  prompt: string,
  options: {
    model?: string;
    instructions?: string;
    schema?: Record<string, unknown>;
    search?: boolean;
  } = {},
) {
  if (!geminiConfigured())
    throw new Error(
      "Configure a chave Gemini no servidor para usar esta busca.",
    );
  const model = options.model || geminiModel();
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model))
    throw new Error("Modelo Gemini inválido.");
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY!,
        },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          ...(options.instructions
            ? { systemInstruction: { parts: [{ text: options.instructions }] } }
            : {}),
          ...(options.search ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8192,
            thinkingConfig: model.startsWith("gemini-3")
              ? { thinkingLevel: "low" }
              : { thinkingBudget: 0 },
            ...(options.schema
              ? {
                  responseMimeType: "application/json",
                  responseJsonSchema: geminiResponseSchema(options.schema),
                }
              : {}),
          },
        }),
      },
    ).catch(() => {
      throw new Error(
        "Tempo limite ou falha de conexão com Gemini. Tente novamente.",
      );
    });
    if ([500, 502, 503, 504].includes(response.status) && attempt === 0) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 400));
      continue;
    }
    break;
  }
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Limite ou cota do Gemini atingido. Confira a cota do projeto e tente novamente."
        : [400, 401, 403].includes(response.status)
          ? "Gemini recusou a solicitação. Confira a chave, as permissões e o modelo no servidor."
          : "Gemini indisponível. Tente novamente mais tarde.",
    );
  }
  const raw = await response.text();
  if (raw.length > 1000000)
    throw new Error("Resposta Gemini excedeu o limite.");
  const result = JSON.parse(raw);
  const candidate = result.candidates?.[0];
  if (candidate?.finishReason !== "STOP")
    throw new Error("Gemini não concluiu a resposta.");
  const text = (candidate.content?.parts || [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text || "")
    .join("");
  if (!text.trim()) throw new Error("Gemini retornou uma resposta vazia.");
  return {
    text,
    grounding: candidate.groundingMetadata,
    tokens: result.usageMetadata?.totalTokenCount || 0,
  };
}

export async function geminiJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  model?: string,
  instructions?: string,
): Promise<T> {
  const result = await generateGemini(prompt, {
    model,
    instructions,
    schema: z.toJSONSchema(schema),
  });
  return schema.parse(JSON.parse(result.text));
}
