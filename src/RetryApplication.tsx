import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field } from "./components";
import { useAction, useApp } from "./lib";

export function RetryApplication({applicationId}:{applicationId:string}) {
  const [confirmed,setConfirmed]=useState(false),[reason,setReason]=useState("");
  const action=useAction(),client=useQueryClient(),{toast}=useApp();
  return <section className="notice-inline" aria-label="Revisão de tentativa sem confirmação">
    <h3>Revisar tentativa sem confirmação</h3>
    <p>Confira o destino antes de repetir. Se a empresa já recebeu a candidatura, não autorize uma nova tentativa. Esta revisão preserva o histórico e não confirma um envio.</p>
    <Field label="Como confirmou que não houve envio?">
      <textarea value={reason} maxLength={1000} onChange={event=>setReason(event.target.value)}/>
    </Field>
    <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> Verifiquei que esta candidatura não foi enviada ao destino.</label>
    <Button disabled={!confirmed||reason.trim().length<10||action.isPending} onClick={()=>action.mutate({path:`/applications/${applicationId}/confirm-not-submitted`,body:{confirmation:true,reason}}, {onSuccess:()=>{toast("Revisão registrada. Revise e autorize a retomada desta candidatura.");void client.invalidateQueries({queryKey:["submission-readiness"]});}})}>Registrar ausência de envio</Button>
  </section>;
}
