import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  Search,
  SlidersHorizontal,
  FileText,
  BriefcaseBusiness,
  ArrowRight,
  Clock3,
} from "lucide-react";

export const demoStages = [
  {
    title: "Configure sua direção.",
    text: "Seu currículo, os cargos e a modalidade que combinam com você.",
    icon: SlidersHorizontal,
  },
  {
    title: "Inicie a busca.",
    text: "As fontes disponíveis são consultadas em segundo plano.",
    icon: Search,
  },
  {
    title: "Descubra vagas reais.",
    text: "Anúncios reunidos com a fonte e o link original.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Confira a compatibilidade.",
    text: "Requisitos comparados às informações que você confirmou.",
    icon: Check,
  },
  {
    title: "Avance nas candidaturas.",
    text: "Envio nas integrações autorizadas; perguntas adicionais ficam para você.",
    icon: FileText,
  },
  {
    title: "Acompanhe os resultados.",
    text: "Recibos, pendências e próximos passos no mesmo painel.",
    icon: Clock3,
  },
];
const names = [
  "Assistente administrativo",
  "Analista de atendimento",
  "Auxiliar de operações",
];
export default function WorkflowDemo({
  stage,
  playing,
}: {
  stage: number;
  playing: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="workflow-demo" data-demo-stage={stage}>
      <div className="demo-panel-heading">
        <span>SEU ESPAÇO</span>
        <span>Exemplo ilustrativo</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={stage}
          className="demo-stage-body"
          initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : -6 }}
          transition={{ duration: reduced ? 0 : 0.25 }}
        >
          <h3>
            {
              [
                "Suas preferências, salvas",
                "Buscando oportunidades",
                "Novas oportunidades",
                "O que combina com você",
                "Cada envio tem uma etapa",
                "Tudo em um só lugar",
              ][stage]
            }
          </h3>
          {stage === 0 ? (
            <>
              <div className="demo-resume">
                <FileText size={22} />
                <div>
                  <strong>Currículo revisado</strong>
                  <span>Informações confirmadas por você</span>
                </div>
                <Check size={17} />
              </div>
              <div className="demo-chips">
                <span>Administrativo</span>
                <span>Remoto</span>
                <span>Salário em aberto</span>
              </div>
              <div className="demo-saved">
                <Check size={15} />
                Preferências prontas para a busca
              </div>
            </>
          ) : stage === 1 ? (
            <>
              <div className="demo-search-pulse">
                <Search size={24} />
                <span>Consultando fontes disponíveis…</span>
              </div>
              {[
                "Listagens públicas",
                "Anúncios de empresas",
                "Links originais",
              ].map((label, i) => (
                <motion.div
                  className="demo-source"
                  key={label}
                  initial={{ opacity: reduced ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: reduced ? 0 : i * 0.3 }}
                >
                  <span>{label}</span>
                  <Check size={14} />
                </motion.div>
              ))}
            </>
          ) : stage === 2 || stage === 3 ? (
            <div className="demo-jobs">
              {names.map((name, i) => (
                <motion.div
                  className="demo-job"
                  key={name}
                  initial={{ opacity: reduced ? 1 : 0, x: reduced ? 0 : 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduced ? 0 : i * 0.12 }}
                >
                  <div>
                    <strong>{name}</strong>
                    <span>
                      Empresa exemplo {i + 1} · {i === 1 ? "Híbrido" : "Remoto"}
                    </span>
                  </div>
                  <span
                    className={
                      stage === 3 && i !== 1 ? "demo-match" : "demo-neutral"
                    }
                  >
                    {stage === 2
                      ? "Encontrada"
                      : i === 1
                        ? "Rever local"
                        : "Compatível"}
                  </span>
                </motion.div>
              ))}
            </div>
          ) : stage === 4 ? (
            <div className="demo-application">
              <strong>Assistente administrativo</strong>
              <ol>
                {[
                  "Dados e currículo conferidos",
                  "Envio pela integração autorizada",
                  "Recibo recebido da fonte",
                ].map((label) => (
                  <li key={label}>
                    <Check size={14} />
                    {label}
                  </li>
                ))}
              </ol>
              <p>
                <Clock3 size={14} />
                Outra vaga pediu uma resposta sua
              </p>
            </div>
          ) : (
            <>
              <div className="demo-metrics">
                <div>
                  <strong>3</strong>
                  <span>Encontradas</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>Confirmada</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>Requer ação</span>
                </div>
              </div>
              <div className="demo-job">
                <div>
                  <strong>Próximo passo</strong>
                  <span>Responder à pergunta da candidatura</span>
                </div>
                <ArrowRight size={18} />
              </div>
              <div className="demo-saved">
                <Check size={15} />
                Histórico e recibo organizados
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div
        className="demo-progress"
        role="progressbar"
        aria-label="Etapas da demonstração"
        aria-valuemin={0}
        aria-valuemax={6}
        aria-valuenow={stage + 1}
      >
        <motion.span
          animate={{ width: `${((stage + 1) / 6) * 100}%` }}
          transition={{ duration: reduced ? 0 : 0.4 }}
        />
      </div>
      <div className="demo-panel-foot">
        <span>Etapa {stage + 1} de 6</span>
        <span>
          {playing && !reduced
            ? "Demonstração em andamento"
            : "Explore as etapas"}
        </span>
      </div>
    </div>
  );
}
