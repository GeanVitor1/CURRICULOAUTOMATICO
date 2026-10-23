import AutomaticAnswering from "./AutomaticAnswering";
import { useState } from "react";
import {
  applicationPreferenceFields,
  type ApplicationPreferences as Answers,
} from "../shared/application-preferences";
import { Button, Field } from "./components";
import { useAction, useApp } from "./lib";

export default function ApplicationPreferences() {
  const { w, toast } = useApp();
  const action = useAction();
  const [answers, setAnswers] = useState<Answers>(
    w.profile.applicationPreferences || {},
  );
  const [confirmed, setConfirmed] = useState(false);
  return (
    <>
      <AutomaticAnswering />
      <details className="interview-card">
        <summary>Informações adicionais para candidaturas (opcional)</summary>
        <p>
          Responda com suas informações reais. Para campos sem informação no
          currículo ou nas preferências, a automação usa “não” ou “prefiro não
          informar”.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmed || action.isPending) return;
            const { confirmedAt: _timestamp, ...values } = answers;
            action.mutate(
              {
                path: "/application-preferences",
                method: "PUT",
                body: { ...values, confirmation: true },
              },
              {
                onSuccess: () => {
                  setConfirmed(false);
                  toast("Respostas para candidaturas salvas.");
                },
              },
            );
          }}
        >
          <fieldset
            disabled={action.isPending}
            style={{ border: 0, padding: 0, minWidth: 0 }}
          >
            {applicationPreferenceFields.map((field) => (
              <Field key={field.key} label={field.label}>
                {field.options ? (
                  <select
                    value={answers[field.key] || ""}
                    onChange={(event) => {
                      setAnswers({
                        ...answers,
                        [field.key]: event.target.value,
                      });
                      setConfirmed(false);
                    }}
                  >
                    <option value="">Ainda não respondido</option>
                    {field.options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.key === "linkedin" ? "url" : "text"}
                    maxLength={field.key === "linkedin" ? 500 : 2000}
                    value={answers[field.key] || ""}
                    onChange={(event) => {
                      setAnswers({
                        ...answers,
                        [field.key]: event.target.value,
                      });
                      setConfirmed(false);
                    }}
                  />
                )}
              </Field>
            ))}
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Confirmo que estas respostas são minhas e autorizo reutilizá-las
              em candidaturas compatíveis.
            </label>
            <p>
              Perguntas específicas da empresa, parentesco e consentimentos
              aparecem nesta página, na seção de perguntas das vagas, antes do
              envio.
            </p>
            <Button
              className="primary"
              disabled={!confirmed || action.isPending}
              type="submit"
            >
              Salvar respostas para candidaturas
            </Button>
          </fieldset>
        </form>
      </details>
    </>
  );
}
