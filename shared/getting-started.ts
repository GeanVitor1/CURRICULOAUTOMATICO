import type { Workspace } from "./types";
import { candidateDetailsReady } from "./candidate-details";

/** Progress comes from this account's saved facts, never from clicking a guide. */
export function gettingStarted(w: Workspace) {
  const resume = w.resumes[0];
  const hasResume = !!resume;
  const details = candidateDetailsReady(w.profile);
  const preferences =
    !!resume &&
    !!resume.approved &&
    w.profile.confirmed &&
    !!w.interview?.completed &&
    w.interview.answers.resumeId === resume.id;
  const configured = hasResume && details && preferences;
  const steps = [
    {
      id: "curriculo",
      title: "Importe ou crie seu currículo",
      short: "Currículo",
      description:
        "Envie um PDF ou DOCX. Se ainda não tem currículo, nós ajudamos a criar.",
      action: "Adicionar meu currículo",
      done: hasResume,
    },
    {
      id: "dados",
      title: "Confira seus dados",
      short: "Seus dados",
      description:
        "Confirme contato, cidade e experiência. Primeiro emprego também tem espaço aqui.",
      action: "Conferir meus dados",
      done: details,
    },
    {
      id: "preferencias",
      title: "Escolha as vagas que procura",
      short: "Preferências",
      description:
        "Defina cargos, local, salário e limite diário em perguntas curtas.",
      action: "Escolher minhas vagas",
      done: preferences,
    },
    {
      id: "automacao",
      title: "Revise e escolha como começar",
      short: "Início da rotina",
      description:
        "Confira os canais disponíveis. Você decide quando iniciar a busca ou os envios.",
      action: "Ver minha rotina",
      done: configured && w.routine.enabled,
    },
  ] as const;
  const current = steps.findIndex((step) => !step.done);
  return {
    steps,
    current: current < 0 ? steps.length - 1 : current,
    completed: steps.filter((step) => step.done).length,
    configured,
    next: steps[current < 0 ? steps.length - 1 : current],
  };
}
/** Reading/importing a resume stays accessible; required facts still gate setup. */
export function needsCandidateDetailsPage(w: Workspace, page: string) {
  return (
    (page === "preferencias" || page === "perfil-inteligente") &&
    !!w.resumes.length &&
    !candidateDetailsReady(w.profile)
  );
}
