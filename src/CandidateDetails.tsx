import { useState } from "react";
import { Button, Field, Mascot, PageHead } from "./components";
import { useAction, useApp } from "./lib";

export default function CandidateDetails() {
  const { w, navigate, toast } = useApp();
  const action = useAction();
  const [phone, setPhone] = useState(w.profile.phone || "");
  const [location, setLocation] = useState(w.profile.location);
  const [years, setYears] = useState(
    w.profile.years === null ? "" : String(w.profile.years),
  );
  const [salary, setSalary] = useState(
    w.profile.salaryDesired > 0 ? String(w.profile.salaryDesired) : "",
  );
  const [undefinedSalary, setUndefinedSalary] = useState(
    !!w.profile.candidateDetailsConfirmedAt && w.profile.salaryDesired === 0,
  );
  const [confirmation, setConfirmation] = useState(false);
  const [acceptsPj, setAcceptsPj] = useState(
    w.profile.acceptsPj === undefined ? "" : String(w.profile.acceptsPj),
  );
  const [compensationDisclosure, setCompensationDisclosure] = useState(
    w.profile.compensationDisclosure || "",
  );
  const [currentCompensation, setCurrentCompensation] = useState(
    w.profile.currentCompensation || "",
  );
  return (
    <div className="career-flow">
      <PageHead
        title="Seus dados para candidaturas"
        description="Confirme estas informações para não faltarem dados quando uma vaga pedir seu currículo."
      />
      <form
        className="interview-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (action.isPending || !confirmation) return;
          action.mutate(
            {
              path: "/candidate-details",
              method: "PUT",
              body: {
                phone,
                location,
                acceptsPj: acceptsPj === "" ? null : acceptsPj === "true",
                compensationDisclosure,
                currentCompensation:
                  compensationDisclosure === "inform"
                    ? currentCompensation
                    : undefined,
                years: years.trim() ? Number(years) : null,
                salaryDesired: undefinedSalary
                  ? 0
                  : salary.trim()
                    ? Number(salary)
                    : null,
                confirmation: true,
              },
            },
            {
              onSuccess: () => {
                toast("Dados confirmados. Você pode continuar seu cadastro.");
                navigate(w.resumes.length ? "preferencias" : "curriculo");
              },
            },
          );
        }}
      >
        <Mascot className="journey-mascot" variant="idea" decorative />
        <h2>Vamos completar seu cadastro</h2>
        <p>
          Você poderá atualizar essas respostas nas preferências. Cada empresa
          ainda pode fazer perguntas específicas, que ficarão pendentes para
          você responder.
        </p>
        <fieldset
          disabled={action.isPending}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <Field label="Cidade e estado onde você mora">
            <input
              required
              minLength={3}
              maxLength={200}
              autoComplete="address-level2"
              placeholder="Ex.: Ilhéus, BA"
              value={location}
              onChange={(event) => {
                setLocation(event.target.value);
                setConfirmation(false);
              }}
            />
          </Field>
          <Field label="Telefone com DDD">
            <input
              required
              type="tel"
              autoComplete="tel"
              maxLength={30}
              placeholder="Ex.: (73) 99999-9999"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setConfirmation(false);
              }}
            />
          </Field>
          <Field label="Anos de experiência na área em que deseja trabalhar">
            <input
              required
              type="number"
              min={0}
              max={70}
              step="0.5"
              value={years}
              onChange={(event) => {
                setYears(event.target.value);
                setConfirmation(false);
              }}
            />
          </Field>
          <p className="interview-help">
            Se procura seu primeiro emprego na área, informe 0.
          </p>
          <Field label="Pretensão salarial por mês (R$)">
            <input
              required={!undefinedSalary}
              disabled={undefinedSalary}
              type="number"
              min={1}
              max={10000000}
              step="0.01"
              value={salary}
              onChange={(event) => {
                setSalary(event.target.value);
                setConfirmation(false);
              }}
            />
          </Field>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={undefinedSalary}
              onChange={(event) => {
                setUndefinedSalary(event.target.checked);
                setConfirmation(false);
              }}
            />
            Ainda não tenho pretensão salarial definida
          </label>
          <p className="interview-help">
            A pretensão é sua resposta para formulários. Ela não define um
            salário mínimo para filtrar vagas. Sem um valor definido,
            formulários que exigirem essa resposta pedirão sua participação.
          </p>
          <Field label="Você aceita contratação PJ?">
            <select
              required
              value={acceptsPj}
              onChange={(event) => {
                setAcceptsPj(event.target.value);
                setConfirmation(false);
              }}
            >
              <option value="">Selecione sua resposta</option>
              <option value="true">Sim, aceito PJ</option>
              <option value="false">Não aceito PJ</option>
            </select>
          </Field>
          <Field label="Remuneração atual ou última e benefícios">
            <select
              required
              value={compensationDisclosure}
              onChange={(event) => {
                setCompensationDisclosure(event.target.value);
                setConfirmation(false);
              }}
            >
              <option value="">Escolha como responder</option>
              <option value="inform">Quero informar</option>
              <option value="prefer_not_to_say">Prefiro não informar</option>
            </select>
          </Field>
          {compensationDisclosure === "inform" && (
            <Field label="Sua remuneração atual ou última + benefícios">
              <textarea
                required
                maxLength={1000}
                value={currentCompensation}
                placeholder="Ex.: R$ 2.500 por mês + vale-alimentação. Se nunca trabalhou, informe isso aqui."
                onChange={(event) => {
                  setCurrentCompensation(event.target.value);
                  setConfirmation(false);
                }}
              />
            </Field>
          )}
          <p className="interview-help">
            Essa resposta é diferente da sua pretensão salarial. Ao escolher
            “Prefiro não informar”, usaremos essa frase quando a empresa
            perguntar sobre remuneração anterior.
          </p>
          <label className="checkbox-field">
            <input
              required
              type="checkbox"
              checked={confirmation}
              onChange={(event) => setConfirmation(event.target.checked)}
            />
            Confirmo que estes dados estão corretos e podem ser usados nas
            minhas candidaturas.
          </label>
          <div className="interview-actions">
            <Button
              type="submit"
              className="primary"
              disabled={!confirmation || action.isPending}
            >
              {action.isPending ? "Salvando…" : "Salvar e continuar"}
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
