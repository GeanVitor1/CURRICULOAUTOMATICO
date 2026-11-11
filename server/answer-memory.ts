import { randomUUID } from "node:crypto";
import type { Workspace } from "../shared/types";
import { classifyQuestion, topicKey, type AnswerMemoryEntry, type AnswerTopic } from "../shared/answer-topics";
import { memoryAnswer } from "./answer-topics";
import { normalized } from "./job-identity";
import { legalAcceptance } from "./automatic-answers";
import { identityQuestion, sensitiveQuestion } from "./approved-answers";

export type MemoryInput = {
  topic: AnswerTopic;
  params?: { technology?: string };
  value: string;
  conditions?: AnswerMemoryEntry["conditions"];
  reuse?: boolean;
  examples?: string[];
};

/** Upserts one entry per topic (+technology). Only the user writes here. */
export function upsertMemory(w: Workspace, input: MemoryInput) {
  const memory = (w.profile.answerMemory ||= []);
  const same = (m: AnswerMemoryEntry) => m.topic === input.topic &&
    normalized(m.params?.technology || "") === normalized(input.params?.technology || "");
  const previous = memory.find(same);
  const entry: AnswerMemoryEntry = {
    id: previous?.id || randomUUID(),
    topic: input.topic,
    ...(input.params?.technology ? { params: { technology: normalized(input.params.technology) } } : {}),
    value: input.value,
    ...(input.conditions ? { conditions: input.conditions } : {}),
    source: "user",
    confirmedAt: new Date().toISOString(),
    examples: [...new Set([...(previous?.examples || []), ...(input.examples || [])])].slice(-10),
    reuse: input.reuse ?? true,
  };
  w.profile.answerMemory = [...memory.filter((m) => !same(m)), entry];
  return entry;
}

const blocked = (q: string) => legalAcceptance(q) || identityQuestion(q);

/**
 * Re-checks every paused application: questions now answerable from memory (or the
 * exact answer given for an untopiced question) are recorded as destination-scoped
 * approved answers and removed from the pending list. Applications with nothing
 * left pending go back to the preparation queue (the form is inspected again before sending).
 */
export function releasePending(w: Workspace, untopiced?: { key: string; value: string }) {
  const released: string[] = [];
  const at = new Date().toISOString();
  for (const a of w.applications) {
    if (a.status !== "Requer ação manual" || !a.missingQuestions?.length || !a.destinationUrl || a.receipt || a.submittedAt) continue;
    const job = w.jobs.find((j) => j.id === a.jobId);
    if (!job) continue;
    const origin = new URL(a.destinationUrl).origin;
    const resolved: string[] = [];
    for (const question of a.missingQuestions) {
      if (blocked(question)) continue;
      const options = a.questionOptions?.[question];
      let value: string | undefined;
      const match = classifyQuestion(question, options);
      if (match) value = memoryAnswer(question, w.profile, job, options)?.value;
      else if (untopiced && topicKey(null, question) === untopiced.key && !sensitiveQuestion(question))
        value = !options?.length ? untopiced.value : options.find((o) => normalized(o) === normalized(untopiced.value));
      if (!value) continue;
      w.profile.approvedAnswers = [
        ...(w.profile.approvedAnswers || []).filter((x) => !(x.question === question && x.destinationUrl === a.destinationUrl)),
        { id: randomUUID(), question, aliases: [], value, confirmedAt: at, destinationOrigin: origin, destinationUrl: a.destinationUrl },
      ].slice(-200);
      resolved.push(question);
    }
    if (!resolved.length) continue;
    a.missingQuestions = a.missingQuestions.filter((q) => !resolved.includes(q));
    a.updatedAt = at;
    a.history.push({ at, actor: "Usuário", message: `Respondeu ${resolved.length} pergunta(s) pendente(s) pelo Perfil inteligente.` });
    if (!a.missingQuestions.length && !a.singleSubmission &&
        (a.resumeState?.kind === "ats" || !a.history.some((e) => e.message.startsWith("Envio iniciado.")))) {
      a.status = "Aguardando aprovação";
      delete a.automaticBlockedFingerprint;
      a.history.push({ at, actor: "Sistema", message: "Sem perguntas pendentes. O formulário será conferido novamente antes do envio." });
      released.push(a.id);
    }
  }
  return released;
}
