import {
  ArrowRight,
  Check,
  FileCheck2,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import { Button, Mascot, Modal } from "./components";
import { useApp } from "./lib";
import { gettingStarted } from "../shared/getting-started";

function JourneySteps({ compact = false }: { compact?: boolean }) {
  const { w, navigate } = useApp(),
    journey = gettingStarted(w);
  return (
    <ol
      className={`start-steps${compact ? " is-compact" : ""}`}
      aria-label="Etapas para começar"
    >
      {journey.steps.map((step, index) => (
        <li
          key={step.id}
          className={
            step.done
              ? "is-done"
              : index === journey.current
                ? "is-current"
                : "is-next"
          }
          aria-current={
            !step.done && index === journey.current ? "step" : undefined
          }
        >
          <span className="start-step-number" aria-hidden="true">
            {step.done ? <Check size={17} /> : index + 1}
          </span>
          <div className="start-step-copy">
            <strong>{compact ? step.short : step.title}</strong>
            {!compact && <p>{step.description}</p>}
            <span className="start-step-state">
              {step.done
                ? "Concluído"
                : index === journey.current
                  ? "Seu próximo passo"
                  : "Depois"}
            </span>
          </div>
          {!compact && (step.done || index === journey.current) && (
            <Button
              className={!step.done ? "primary" : ""}
              onClick={() => navigate(step.id)}
            >
              {step.done ? "Revisar" : step.action}
              {!step.done && <ArrowRight size={16} />}
            </Button>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function GettingStarted() {
  const { w } = useApp(),
    journey = gettingStarted(w);
  const firstName = w.profile.name.trim().split(/\s+/)[0];
  return (
    <section className="getting-started" aria-labelledby="start-title">
      <div className="start-intro">
        <div>
          <span className="start-eyebrow">SUA CONTA ESTÁ PRONTA</span>
          <h2 id="start-title">
            {journey.completed
              ? `Vamos continuar${firstName ? ", " + firstName : ""}?`
              : `Boas-vindas${firstName ? ", " + firstName : ""}!`}
          </h2>
          <p>
            Vamos preparar sua busca, um passo de cada vez. Você pode sair e
            continuar depois.
          </p>
        </div>
        <Mascot className="start-mascot" variant="writing-to-you" decorative />
      </div>
      <div className="start-progress-label">
        <span>Seu caminho até as candidaturas</span>
        <strong>{journey.completed} de 4 etapas</strong>
      </div>
      <div
        className="start-progress"
        role="progressbar"
        aria-label="Configuração da conta"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={journey.completed}
        aria-valuetext={`${journey.completed} de 4 etapas concluídas`}
      >
        <span style={{ width: `${journey.completed * 25}%` }} />
      </div>
      <JourneySteps />
      <p className="start-reassurance">
        <ShieldCheck size={19} aria-hidden="true" />
        Criar a conta ou adicionar um currículo não envia candidaturas. Você
        escolhe quando começar.
      </p>
      <div className="start-faq" aria-label="Dúvidas para começar">
        <details>
          <summary>Ainda não tenho currículo ou experiência</summary>
          <p>
            Na etapa Currículo, escolha “Ainda não tenho currículo”. Vamos
            ajudar a organizar sua formação, cursos, habilidades e experiências
            informais. Para primeiro emprego, você pode informar zero anos de
            experiência.
          </p>
        </details>
        <details>
          <summary>Preciso conectar todos os sites agora?</summary>
          <p>
            Primeiro prepare seu currículo e suas preferências. Depois, confira
            os canais disponíveis na sua rotina. A extensão será necessária
            apenas para os portais que usarem esse tipo de conexão; instalar ou
            conectar não inicia envios.
          </p>
        </details>
        <details>
          <summary>Como vou saber se uma candidatura foi enviada?</summary>
          <p>
            Em Candidaturas você acompanha cada resultado. Uma vaga encontrada
            ou uma candidatura preparada ainda não é um envio confirmado.
            Perguntas que precisam da sua resposta ficam sinalizadas para
            revisão.
          </p>
        </details>
      </div>
    </section>
  );
}

export function SetupProgress({ page }: { page: string }) {
  const { w, navigate } = useApp(),
    journey = gettingStarted(w);
  if (
    journey.configured ||
    !["curriculo", "dados", "preferencias", "perfil-inteligente"].includes(page)
  )
    return null;
  return (
    <section
      className="setup-progress"
      aria-label="Seu progresso de configuração"
    >
      <div className="setup-progress-heading">
        <span>
          <FileCheck2 size={17} aria-hidden="true" />
          Prepare sua busca
        </span>
        <strong>{journey.completed} de 4 etapas</strong>
      </div>
      <JourneySteps compact />
      {page !== journey.next.id && (
        <button
          type="button"
          className="setup-continue"
          onClick={() => navigate(journey.next.id)}
        >
          Continuar: {journey.next.title.toLowerCase()}
          <ArrowRight size={15} />
        </button>
      )}
    </section>
  );
}

export function ProductHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { navigate } = useApp();
  return (
    <Modal
      title="Como usar o EmpreGatos"
      description="Consulte seu progresso e encontre o próximo passo quando precisar."
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <div className="product-help-intro">
        <HelpCircle size={21} />
        <p>
          Você controla o currículo, as vagas que procura e o início da rotina.
        </p>
      </div>
      <JourneySteps compact />
      <div className="product-help-links">
        {[
          ["curriculo", "Currículo", "Importar, criar ou revisar o documento."],
          ["dados", "Seus dados", "Conferir contato e respostas básicas."],
          [
            "perfil-inteligente",
            "Perfil inteligente",
            "Mudar cargos, local, salário e sites.",
          ],
          [
            "automacao",
            "Automação",
            "Conectar portais e iniciar ou pausar a rotina.",
          ],
          [
            "candidaturas",
            "Candidaturas",
            "Ver confirmações e o que precisa de você.",
          ],
        ].map(([page, label, text]) => (
          <button
            type="button"
            key={page}
            onClick={() => {
              onClose();
              navigate(page);
            }}
          >
            <span>
              <strong>{label}</strong>
              <small>{text}</small>
            </span>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>
      <details className="product-help-faq">
        <summary>Conexão, busca e envio: qual é a diferença?</summary>
        <p>
          Conectar identifica ou autoriza o acesso ao portal. Buscar encontra
          anúncios. Preparar organiza a candidatura. O envio automático só
          ocorre nos canais disponíveis, depois da sua autorização. No LinkedIn,
          a conexão atual apenas reconhece o login no seu Chrome.
        </p>
      </details>
      <div className="modal-footer">
        <Button onClick={onClose}>Entendi, voltar</Button>
      </div>
    </Modal>
  );
}
