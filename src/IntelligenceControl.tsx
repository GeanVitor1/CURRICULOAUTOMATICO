import { useEffect, useState } from "react";
import { useAction, useApp } from "./lib";

export default function IntelligenceControl({
  disabled = false,
  onBusyChange,
}: {
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { w, toast } = useApp();
  const action = useAction();
  const config = w.intelligence;
  const [checked, setChecked] = useState(!!config?.enabled);
  useEffect(() => setChecked(!!config?.enabled), [config?.enabled]);
  if (
    !config ||
    (!config.enabled && !config.geminiConfigured && !config.keyConfigured)
  )
    return null;
  return (
    <section className="integration-info" aria-label="Análise por IA">
      <h3>Análise por IA</h3>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || action.isPending}
          onChange={(event) => {
            const enabled = event.target.checked;
            setChecked(enabled);
            onBusyChange?.(true);
            action.mutate(
              {
                path: "/intelligence",
                method: "PUT",
                body: {
                  provider:
                    config.provider === "local" ? "gemini" : config.provider,
                  model:
                    config.model || config.geminiModel || "gemini-2.5-flash",
                  enabled,
                  consent: enabled,
                },
              },
              {
                onSuccess: () =>
                  toast(
                    enabled
                      ? "Análise por IA autorizada."
                      : "Autorização revogada. As próximas análises serão locais.",
                  ),
                onError: () => setChecked(config.enabled),
                onSettled: () => onBusyChange?.(false),
              },
            );
          }}
        />
        Permitir análise dos dados profissionais por IA
      </label>
      <p>
        A autorização vale para próximos uploads e reanálises. Você pode
        desativar a qualquer momento; isso não cancela uma análise já enviada.
      </p>
      {config.privacyUrl && (
        <a href={config.privacyUrl} target="_blank" rel="noreferrer">
          Como os dados são usados
        </a>
      )}
    </section>
  );
}
