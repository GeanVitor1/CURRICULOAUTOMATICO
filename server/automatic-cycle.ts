import type { Routine, Workspace } from "../shared/types";
import { confirmedAutomaticApplication } from "./automation-trace";
import { store, readWorkspace, mutateWorkspace } from "./db";
import { and, eq, inArray } from "./storage-types";
import { accountPlan, billingDay, releasePausedReservations } from "./billing";
import { readyPortals } from "./portal-sessions";
import { queuePreparedApplications } from "./operations";
import { dispatchNextApplication } from "./submission-dispatch";
import { dailySubmissionAttempts } from "./submission-attempts";
import {
  enqueueResolution,
  needsResearch,
  researchAllowance,
} from "./resolution-queue";

const dayOf = (at: string) =>
  new Date(at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export function automaticProgress(
  w: Workspace,
  limit: number,
  state: NonNullable<Routine["progress"]>["state"],
  message: string,
  usedToday?: number,
): NonNullable<Routine["progress"]> {
  const day = dayOf(new Date().toISOString());
  const target = Math.min(w.routine.dailyLimit, limit);
  const sent = w.applications.filter(
    (a) => confirmedAutomaticApplication(a) && dayOf(a.submittedAt!) === day,
  ).length;
  return {
    day,
    target,
    sent,
    usedToday,
    remaining: Math.max(0, target - Math.max(sent, usedToday || 0)),
    state: sent >= target ? "complete" : state,
    message:
      sent >= target
        ? "Limite diário de candidaturas confirmadas atingido."
        : message,
    updatedAt: new Date().toISOString(),
  };
}

export function automaticBlockerMessage(w: Workspace) {
  const pending = w.applications.filter(
    (a) => !a.receipt && !a.submittedAt && a.status === "Requer ação manual",
  );
  const human = pending.filter((a) =>
    /verificação humana|verificacao humana|captcha/i.test(
      a.history.at(-1)?.message || "",
    ),
  ).length;
  const questions = pending.filter((a) => a.missingQuestions?.length).length;
  const uncertain=w.applications.filter(a=>a.status==='Resultado desconhecido'&&!a.receipt&&!a.submittedAt).length;
  const reasons = [
    uncertain ? `${uncertain} tentativa(s) com resultado desconhecido, sem recibo; não serão repetidas automaticamente.` : '',
    human
      ? `${human} candidatura(s) bloqueada(s) por verificação humana no formulário.`
      : "",
    questions
      ? `${questions} candidatura(s) com perguntas ou consentimentos pendentes.`
      : "",
  ].filter(Boolean);
  if (!reasons.length) return "";
  return reasons.join(" ") + " Nenhum desses bloqueios confirma envio.";
}

/** Continue with the account's own pool after each result. No new consent,
 * preference relaxation, uncertain retry or unbounded discovery loop. */
export async function continueAutomaticCycle(
  id: string,
  { allowResearch = true }: { allowResearch?: boolean } = {},
) {
  let w = await readWorkspace(id);
  if (!w || w.demo || !w.routine.enabled || w.routine.mode !== "automatic")
    return;
  const [owner] = await store.select("workspaces", {
    where: eq("id", id),
    columns: ["userId"],
  });
  if (!owner) return;
  const plan = await accountPlan(owner.userId);
  await mutateWorkspace(id, async (current, tx) => {
    if (current.routine.enabled && current.routine.mode === "automatic")
      await releasePausedReservations(tx, owner.userId, current);
  });
  w = await readWorkspace(id);
  if (!w || !w.routine.enabled || w.routine.mode !== "automatic") return;
  const recordedUsage = await store.count(
    "applicationUsage",
    and(eq("userId", owner.userId), eq("day", billingDay())),
  );
  const attempts = dailySubmissionAttempts(w);
  const used = Math.max(recordedUsage, attempts);
  const save = async (
    state: NonNullable<Routine["progress"]>["state"],
    message: string,
  ) =>
    mutateWorkspace(id, (current) => {
      if (current.routine.enabled && current.routine.mode === "automatic")
        current.routine.progress = automaticProgress(
          current,
          plan.dailyLimit,
          state,
          message,
          used,
        );
    });
  const target = Math.min(w.routine.dailyLimit, plan.dailyLimit);
  if (!w.profile.confirmed || !w.resumes.some((resume) => resume.approved)) {
    await save(
      "waiting",
      "Confirme o perfil e um currículo antes de iniciar os envios.",
    );
    return;
  }
  if (used >= target) {
    await save(
      "waiting",
      "A cota diária foi utilizada pelos envios e tentativas registrados. Resultados incertos não são repetidos.",
    );
    return;
  }
  const native = await readyPortals(
    owner.userId,
    w.interview?.answers.resumeId || w.resumes[0]?.id || "",
  );
  await mutateWorkspace(id, async (current, tx) => {
    if (!current.routine.enabled || current.routine.mode !== "automatic")
      return;
    queuePreparedApplications(
      current,
      native,
      target - Math.max(0, used - attempts),
    );
  });
  w = await readWorkspace(id);
  if (!w || !w.routine.enabled || w.routine.mode !== "automatic") return;
  if (
    w.applications.some(
      (a) =>
        a.status === "Enviando" ||
        (a.status === "Aguardando aprovação" && !a.singleSubmission),
    )
  ) {
    await save(
      "sending",
      "Processando candidaturas compatíveis até o limite diário.",
    );
    await dispatchNextApplication(id);
    return;
  }
  if (
    w.runs.some(
      (r) =>
        ["running", "queued"].includes(r.status) &&
        Date.now() - Date.parse(r.at) < 5 * 60_000,
    )
  ) {
    await save(
      "searching",
      "Buscando novas vagas compatíveis para o saldo diário.",
    );
    return;
  }
  const [pending] = await store.select("resolutionTasks", {
    where: and(eq("workspaceId", id), inArray("status", ["queued", "running"])),
    columns: ["id"],
    limit: 1,
  });
  if (pending) {
    await save(
      "researching",
      "Verificando outros destinos de candidatura para o saldo diário.",
    );
    return;
  }
  if (
    allowResearch &&
    researchAllowance(w) > 0 &&
    w.jobs.some((job) => needsResearch(job, w!))
  ) {
    await save(
      "researching",
      "Verificando outros destinos de candidatura para o saldo diário.",
    );
    await enqueueResolution(id);
    return;
  }
  if (Object.values(w.routine.discoveryCheckpoints || {}).some(checkpoint => checkpoint.pending)) {
    const day = billingDay();
    const configured = Number(process.env.AUTOMATIC_DISCOVERY_CONTINUATION_LIMIT ?? 4);
    const maximum = Number.isFinite(configured) ? Math.max(0,Math.min(20,Math.floor(configured))) : 4;
    const advance = await mutateWorkspace(id,current => {
      const checkpoint = current.routine.discoveryContinuation;
      const batches = checkpoint?.day === day ? checkpoint.batches : 0;
      if (batches >= maximum) return false;
      current.routine.discoveryContinuation = {day,batches:batches+1};
      return true;
    });
    if (advance) {
      await save("searching","Consultando a próxima página de oportunidades; o progresso da descoberta foi preservado.");
      await (await import("./discovery-queue")).enqueueDiscovery(id,w.runs[0]?.origin || "legacy_unclassified",true);
      return;
    }
  }
  const quota = w.runs[0]?.errors.some((error) =>
    /cota diária.*esgotada/i.test(error),
  );
  const blocked = automaticBlockerMessage(w);
  const researchExhausted = researchAllowance(w) <= 0;
  const remainingResearch = w.jobs.filter(job=>needsResearch(job,w!)).length;
  await save(
    "waiting",
    researchExhausted && remainingResearch
      ? `O orçamento de pesquisa do dia foi atingido. ${remainingResearch} vaga(s) aguardam verificação; o progresso está salvo para o próximo agendamento. Ainda há saldo de envio.`
      : blocked
      ? `${blocked}${researchExhausted ? " Os destinos disponíveis foram verificados; ainda há saldo diário." : ""}`
      : quota
        ? "A busca com IA atingiu a cota do provedor. As vagas disponíveis não têm outro envio liberado; a rotina retoma na próxima busca."
        : researchExhausted
          ? "Os destinos das vagas disponíveis foram verificados. Ainda há saldo diário, mas nenhum outro envio foi liberado pelos formulários consultados."
          : "Ainda faltam vagas compatíveis com um canal de envio disponível. Vagas bloqueadas não contam como enviadas; a rotina retoma na próxima busca.",
  );
}
