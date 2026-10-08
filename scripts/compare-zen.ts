import "dotenv/config";
import { writeFile } from "node:fs/promises";
const base = "https://opencode.ai/zen/v1";
const key = process.env.OPENCODE_ZEN_API_KEY || process.env.OPENCODE_API_KEY;
const catalog = (await fetch(base + "/models", {
  signal: AbortSignal.timeout(15000),
}).then((r) => r.json())) as { data: { id: string }[] };
const candidates = [
  "longcat-2.5-preview-free",
  "ling-3.1-flash-free",
  "muse-spark-1.3-contributor-free",
].filter((id) => catalog.data.some((m) => m.id === id));
const tests = [];
for (const model of candidates) {
  const started = performance.now();
  if (!key) {
    tests.push({ model, ok: false, message: "Chave não configurada" });
    continue;
  }
  try {
    const instructions =
      'Extraia apenas competências citadas. Responda JSON {"skills":[strings]}. Não crie experiência ou formação.';
    const input =
      "Exemplo fictício de teste, sem identificação: atendimento ao público, organização de estoque.";
    const responses = model.startsWith("muse-spark");
    const response = await fetch(
      base + (responses ? "/responses" : "/chat/completions"),
      {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(
          responses
            ? {
                model,
                instructions,
                input,
                max_output_tokens: 300,
                store: false,
              }
            : {
                model,
                stream: false,
                temperature: 0,
                max_tokens: 300,
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: instructions },
                  { role: "user", content: input },
                ],
              },
        ),
      },
    );
    const payload = await response.json();
    if (!response.ok) {
      const message = String(
        payload?.error?.message || payload?.message || "Pedido recusado",
      )
        .replace(/oc_sk_[\w-]+/g, "[segredo removido]")
        .slice(0, 250);
      tests.push({
        model,
        ok: false,
        http: response.status,
        milliseconds: Math.round(performance.now() - started),
        message,
      });
      continue;
    }
    const content = responses
      ? payload.output
          ?.flatMap((item: any) => item.content || [])
          .filter((item: any) => item.type === "output_text")
          .map((item: any) => item.text)
          .join("")
      : payload.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    const ok =
      Array.isArray(parsed.skills) &&
      parsed.skills.length === 2 &&
      parsed.skills.every(
        (s: unknown) =>
          typeof s === "string" &&
          input.toLowerCase().includes(s.toLowerCase()),
      );
    tests.push({
      model,
      ok,
      http: response.status,
      milliseconds: Math.round(performance.now() - started),
      tokens: payload.usage?.total_tokens || 0,
      structuredResponseVerified: ok,
    });
  } catch {
    tests.push({
      model,
      ok: false,
      milliseconds: Math.round(performance.now() - started),
      message: "Resposta inválida ou tempo limite atingido",
    });
  }
}
const report = {
  checkedAt: new Date().toISOString(),
  keyConfigured: !!key,
  usesSyntheticTextOnly: true,
  tests,
  recommended:
    tests
      .filter((t) => t.ok)
      .sort((a, b) => (a.milliseconds || 0) - (b.milliseconds || 0))[0]
      ?.model || null,
};
await writeFile("artifacts/zen-live.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
