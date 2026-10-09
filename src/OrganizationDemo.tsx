import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Search,
  Bookmark,
  BriefcaseBusiness,
  Check,
  ArrowRight,
  Clock3,
  FileText,
} from "lucide-react";

export default function OrganizationDemo({
  organized,
}: {
  organized: boolean;
}) {
  const reduced = useReducedMotion();
  const cards = organized
    ? [
        {
          title: "Oportunidades reunidas",
          detail: "Uma lista com fontes e links originais",
          icon: Search,
          items: [
            "Assistente administrativo · Gupy",
            "Analista de atendimento · fonte autorizada",
          ],
          status: "Critérios aplicados",
        },
        {
          title: "Seu perfil pronto",
          detail: "Currículo e preferências revisados",
          icon: FileText,
          items: [
            "Currículo aprovado por você",
            "Dados preenchidos quando permitido",
          ],
          status: "Sem repetir informações",
        },
        {
          title: "Próximos passos claros",
          detail: "Histórico e confirmação de cada envio",
          icon: BriefcaseBusiness,
          items: [
            "Candidatura com recibo · Confirmada",
            "Pergunta adicional · Requer sua ação",
          ],
          status: "Você sabe o que falta",
        },
      ]
    : [
        {
          title: "Mais uma aba aberta",
          detail: "LinkedIn · Gupy · outros portais",
          icon: Search,
          items: [
            "Onde estava aquela vaga?",
            "A mesma oportunidade em dois sites",
          ],
          status: "Buscas repetidas",
        },
        {
          title: "Currículo de novo",
          detail: "Arquivos e formulários separados",
          icon: FileText,
          items: [
            "curriculo_final_v3.pdf",
            "Nome, experiência, formação… outra vez",
          ],
          status: "Informações espalhadas",
        },
        {
          title: "Será que enviei?",
          detail: "Anotações sem um histórico central",
          icon: Bookmark,
          items: ["Enviar amanhã?", "Qual candidatura ainda está pendente?"],
          status: "Próximo passo incerto",
        },
      ];
  return (
    <div
      className="organization-cards"
      data-organization-state={organized ? "after" : "before"}
    >
      {cards.map((card, i) => (
        <motion.div
          className="organization-card"
          key={i}
          initial={false}
          animate={{
            rotate: reduced || organized ? 0 : [-2, 2, -1][i],
            y: reduced || organized ? 0 : [8, 16, 28][i],
          }}
          transition={{
            duration: reduced ? 0 : 0.75,
            delay: reduced ? 0 : i * 0.1,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={String(organized)}
              className="organization-card-content"
              initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : -6 }}
              transition={{ duration: reduced ? 0 : 0.18 }}
            >
              <div className="organization-card-top">
                <card.icon size={21} />
                <span>
                  {organized
                    ? `0${i + 1}`
                    : ["ABA 08", "ARQUIVO 03", "NOTA SOLTA"][i]}
                </span>
              </div>
              <h3>{card.title}</h3>
              <p>{card.detail}</p>
              <div className="organization-card-items">
                {card.items.map((item) => (
                  <div key={item}>
                    {organized ? <Check size={13} /> : <Clock3 size={13} />}
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <span className="organization-card-status">
                {card.status}
                {organized && <ArrowRight size={13} />}
              </span>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}
