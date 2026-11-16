import { geminiConfigured } from "./gemini";

/** Antigravity is optional for the owner: a missing sandbox or expired Google
 * login must not fail discovery while the Gemini key can still search. */
export function fallbackFromAntigravity(error: unknown): null {
  if (!geminiConfigured()) throw error;
  console.error(JSON.stringify({ event: "antigravity_search_fallback", type: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message.slice(0, 200) : undefined }));
  return null;
}
