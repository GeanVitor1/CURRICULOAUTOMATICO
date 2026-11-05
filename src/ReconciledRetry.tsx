import { useState } from "react";
import { Button } from "./components";
import { api, useAction, useApp } from "./lib";
type Review={ready:boolean;blockers:string[];score:number;review:{fingerprint:string;expiresAt:string}|null};
export default function ReconciledRetry(){
  const {w,toast}=useApp(),action=useAction();
  const [reviews,setReviews]=useState<Record<string,Review>>({}),[confirmed,setConfirmed]=useState<Record<string,boolean>>({}),[busy,setBusy]=useState("");
  const originals=w.applications.filter(a=>a.status==="Falha no envio"&&a.reconciliations?.at(-1)?.outcome==="not_received");
  if(!originals.length)return null;
  return <section className="interview-card" aria-label="Nova tentativa após não recebimento confirmado">
    <h2>Candidatura não recebida pela empresa</h2>
    <p>O histórico original será preservado. Uma nova tentativa exige revisão atual e autorização somente para a vaga escolhida.</p>
    {originals.map(a=>{const job=w.jobs.find(j=>j.id===a.jobId),child=w.applications.find(next=>next.retryOf?.applicationId===a.id),result=reviews[a.id]||(a.retryEvaluation?{...a.retryEvaluation,ready:false,review:null}:undefined);
      return <div key={a.id} className="notice-inline"><h3>{job?.company} — {job?.title}</h3>
        {child?<p>Nova candidatura: {child.status}. Consulte o resultado; esta autorização não permite outra transmissão.</p>:<>
          <Button disabled={!!busy||action.isPending} onClick={async()=>{setBusy(a.id);setConfirmed(c=>({...c,[a.id]:false}));try{
            const next=await api<Review>(`/applications/${a.id}/retry/review`,{method:"POST",body:JSON.stringify({})});setReviews(r=>({...r,[a.id]:next}));
          }catch(e){toast(e instanceof Error?e.message:"Não foi possível revalidar a candidatura.",true);}finally{setBusy("");}}}>Revalidar vaga e formulário</Button>
          {result&&<><p>Última avaliação: {result.ready?'pronta para autorização':'requer revalidação ou correção das pendências'}.</p>{!reviews[a.id]&&<p>Revalide a vaga para atualizar esta avaliação antes de autorizar.</p>}{result.blockers.length>0&&<ul>{result.blockers.map(b=><li key={b}>{b}</li>)}</ul>}
            {result.ready&&result.review&&<><label><input type="checkbox" checked={!!confirmed[a.id]} onChange={e=>setConfirmed(c=>({...c,[a.id]:e.target.checked}))}/> Autorizo uma única nova tentativa para esta vaga, com meu currículo e respostas aprovados, após a confirmação oficial de não recebimento.</label>
              <Button disabled={!confirmed[a.id]||action.isPending||Date.parse(result.review.expiresAt)<=Date.now()} onClick={()=>action.mutate({path:`/applications/${a.id}/retry/authorize`,body:{confirmation:true,fingerprint:result.review!.fingerprint}},{onSuccess:()=>toast("Autorização registrada. O backend processará somente esta candidatura.")})}>Autorizar nova tentativa — {job?.company}</Button></>}
          </>}
        </>}
      </div>;})}
  </section>;
}
