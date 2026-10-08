import { Bell, CheckCheck, Sparkles } from "lucide-react";
import { Badge, Button, Empty, PageHead, Panel } from "../components";
import { date, useAction, useApp } from "../lib";
export default function Notifications() {
  const { w, toast } = useApp();
  const a = useAction();
  return (
    <div>
      <PageHead
        eyebrow="O QUE MERECE SUA ATENÇÃO"
        title="Notificações"
        description="Atualizações de buscas, candidaturas e próximos passos."
      >
        <Button
          disabled={a.isPending || !w.notices.some((n) => !n.read)}
          onClick={() =>
            a.mutate(
              { path: "/notices", method: "PATCH" },
              { onSuccess: () => toast("Notificações marcadas como lidas.") },
            )
          }
        >
          <CheckCheck size={15} />
          Marcar todas como lidas
        </Button>
      </PageHead>
      <Panel
        title="Atividade do seu workspace"
        detail={`${w.notices.filter((n) => !n.read).length} novas atualizações`}
      >
        {w.notices.length ? (
          w.notices.map((n) => (
            <article className="notification-row" key={n.id}>
              <span className="connection-icon">
                <Sparkles size={18} />
              </span>
              <div>
                <strong>{n.title}</strong>
                <p>{n.message}</p>
                <small>{date(n.at, true)}</small>
              </div>
              {!n.read && <Badge tone="blue">Nova</Badge>}
            </article>
          ))
        ) : (
          <Empty
            title="Tudo tranquilo por aqui"
            description="Quando uma busca terminar ou uma candidatura mudar de etapa, você acompanha a atualização neste espaço."
            icon={<Bell size={27} />}
          />
        )}
      </Panel>
    </div>
  );
}
