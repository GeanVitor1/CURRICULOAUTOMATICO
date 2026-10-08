import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, BookOpen, Check, X } from "lucide-react";
import { Button, Mascot, Modal } from "./components";
import { useAction, useApp } from "./lib";

export const guideSteps = [
  {
    page: "curriculo",
    title: "Prepare seu currículo",
    text: "Se você já enviou ou criou um currículo, clique em Revisar texto. Confira os dados e escolha Aprovar esta versão. Ainda não tem um? Use o botão Ainda não tenho currículo.",
    tip: "Aprovar autoriza o uso dessa versão nas candidaturas. Não envia o documento a uma empresa.",
  },
  {
    page: "perfil",
    title: "Confira o que sabemos sobre você",
    text: "Revise formação, habilidades e experiências, inclusive as informais. Informe apenas o que é verdadeiro. Marque a confirmação no final da página e clique em Salvar perfil.",
    tip: "Não precisa preencher GitHub, portfólio ou experiência profissional para começar.",
  },
  {
    page: "configuracoes",
    title: "Escolha onde procurar",
    text: "Na lista de empresas, confira o setor e os lugares cobertos. Escolha Adicionar e pesquisar. A busca acontece em segundo plano; você pode continuar usando o sistema enquanto ela termina.",
    tip: "Uma fonte é um mural de vagas. Se não cobrir sua cidade ou profissão, pode não haver resultados.",
  },
  {
    page: "vagas",
    title: "Confira suas oportunidades",
    text: "Use Ajustar busca para mudar cargo, cidade ou outras preferências. Abra uma oportunidade para conferir os requisitos. Salvar guarda a vaga para depois. Abrir vaga original leva ao anúncio da empresa.",
    tip: "A compatibilidade compara requisitos. Ela não é uma chance de contratação.",
  },
  {
    page: "candidaturas",
    title: "Acompanhe o que você enviou",
    text: "Preparar candidatura organiza a oportunidade, mas você ainda precisa concluir o envio no site oficial. Depois de enviar, abra a candidatura aqui, escolha Enviada e confirme que concluiu o envio.",
    tip: "Só confirme Enviada depois de realmente finalizar a candidatura. Registre entrevistas e respostas à medida que acontecerem.",
  },
  {
    page: "automacao",
    title: "Escolha seu ritmo",
    text: "Se quiser, configure uma busca diária e escolha o horário. Comece pelo modo Descoberta: ele busca oportunidades sem preparar ou enviar candidaturas. Você pode pausar a rotina a qualquer momento.",
    tip: "O computador e o serviço precisam ficar ligados na execução local. A rotina não supera a falta de cobertura das fontes.",
  },
] as const;

export default function GuidedTour({
  openHelp,
  onClose,
}: {
  openHelp: boolean;
  onClose: () => void;
}) {
  const { w, navigate, toast } = useApp();
  const a = useAction();
  const [localClosed, setLocalClosed] = useState(false);
  const firstVisit =
    w.onboarding?.completed !== false &&
    !w.guide?.completed &&
    !w.guide?.dismissed &&
    !w.guide?.active &&
    !localClosed;
  const open = openHelp || firstVisit;
  const step = Math.min(5, w.guide?.step || 0),
    current = guideSteps[step];
  const save = (next: number, active: boolean, completed = false) =>
    a.mutate(
      {
        path: "/guide",
        method: "PUT",
        body: {
          step: next,
          active,
          completed: completed || (!active && !!w.guide?.completed),
          dismissed: !active || completed,
        },
      },
      {
        onSuccess: () => {
          setLocalClosed(true);
          onClose();
          if (active) navigate(guideSteps[next].page);
          if (completed) {
            navigate("visao-geral");
            toast("Você concluiu o guia. Pode rever as etapas quando quiser.");
          }
        },
      },
    );
  return (
    <>
      <Modal
        title="Vamos conhecer a EmpreGatos?"
        description="Um guia rápido para você aprender onde clicar e o que fazer em cada etapa. Dá para pausar e continuar depois."
        open={open}
        onOpenChange={(value) => {
          if (!value) save(step, false);
        }}
      >
        <div className="guide-welcome">
          <Mascot className="guide-mascot" />
          <div>
            <span className="eyebrow">SEU COMPANHEIRO DE BUSCA</span>
            <h3>Um passo de cada vez.</h3>
            <p>
              Vamos passar pelo currículo, perfil, busca de vagas e
              acompanhamento. Você pode usar cada tela enquanto lê as
              orientações.
            </p>
          </div>
        </div>
        <ol className="guide-overview">
          {guideSteps.map((item, index) => (
            <li key={item.page}>
              <span>{index + 1}</span>
              {item.title}
            </li>
          ))}
        </ol>
        <div className="modal-footer">
          <Button disabled={a.isPending} onClick={() => save(step, false)}>
            Explorar por conta própria
          </Button>
          <Button
            className="primary"
            disabled={a.isPending}
            onClick={() => save(w.guide?.completed ? 0 : step, true)}
          >
            <BookOpen size={15} />
            {w.guide?.step && !w.guide.completed
              ? "Continuar o guia"
              : "Quero aprender a usar"}
          </Button>
        </div>
      </Modal>
      <AnimatePresence>
        {w.guide?.active && !open && (
          <motion.aside
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="guided-panel"
            aria-label="Guia de uso passo a passo"
          >
            <div className="guided-panel-head">
              <span>
                <BookOpen size={15} /> APRENDA A USAR · {step + 1}/6
              </span>
              <button
                className="icon-button"
                aria-label="Pausar guia"
                disabled={a.isPending}
                onClick={() => save(step, false)}
              >
                <X size={16} />
              </button>
            </div>
            <h2>{current.title}</h2>
            <p>{current.text}</p>
            <div className="guided-tip">
              <Check size={14} />
              {current.tip}
            </div>
            <div className="guided-actions">
              <Button
                disabled={step === 0 || a.isPending}
                onClick={() => save(step - 1, true)}
              >
                <ArrowLeft size={14} />
                Anterior
              </Button>
              <button
                className="text-button"
                onClick={() => navigate(current.page)}
              >
                Abrir esta tela
              </button>
              <Button
                className="primary"
                disabled={a.isPending}
                onClick={() =>
                  step === 5 ? save(step, false, true) : save(step + 1, true)
                }
              >
                {step === 5 ? "Concluir guia" : "Próxima etapa"}
                <ArrowRight size={14} />
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
