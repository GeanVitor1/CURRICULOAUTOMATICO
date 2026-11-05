import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { operatorStore } from "./operator-firestore";
import { and, eq } from "../server/storage-types";
import { candidateEmailHash, reconcileEmployerNonReceipt, type NonReceiptEvidence } from "../server/application-reconciliation";
const evidence: NonReceiptEvidence = JSON.parse(await readFile(".data/globalti-verified-evidence.json", "utf8"));
const apply = process.argv.includes("--apply");
const {store,operatorEmail}=await operatorStore();
try {
  if (candidateEmailHash(operatorEmail) !== evidence.candidateEmailSha256) throw Error("Verified candidate and operator do not match");
  const [owner]=await store.select("users",{where:eq("email",operatorEmail)});
  if(!owner)throw Error("Owner missing");
  const rows=await store.select("workspaces",{where:and(eq("userId",owner.id),eq("demo",false)),columns:["id"]});
  if(rows.length!==1)throw Error("Ambiguous workspace");
  const report=await store.transaction(async tx=>{
    const [row]=await tx.select("workspaces",{where:eq("id",rows[0].id),lock:true});
    const w=row.data, before=structuredClone(w.applications.find(a=>a.id===evidence.applicationId));
    if(!before)throw Error("Application missing");
    const quota=await tx.select("applicationUsage",{where:and(eq("applicationId",before.id),eq("userId",owner.id))});
    const result=reconcileEmployerNonReceipt(w,evidence),after=w.applications.find(a=>a.id===before.id)!;
    if(JSON.stringify(before.attempts)!==JSON.stringify(after.attempts)||JSON.stringify(before.history)!==JSON.stringify(result.changed?after.history.slice(0,-1):after.history))throw Error("Original attempt/history must stay intact");
    if(apply&&result.changed)await tx.update("workspaces",{data:w,updatedAt:new Date()},eq("id",row.id));
    return {at:new Date().toISOString(),applied:apply,changed:apply&&result.changed,workspaceId:row.id,
      evidence,originalAttemptSha256:createHash("sha256").update(JSON.stringify(before.attempts)).digest("hex"),
      originalStatus:before.status,resultingStatus:after.status,reconciliation:result.reconciliation,
      quota:{records:quota.length,days:quota.map(q=>q.day),disposition:"retained_post_submit_attempt",newReservations:0},
      originalAttemptPreserved:true,originalHistoryPreserved:true,retryAuthorized:false,newTransmissions:0,receipt:after.receipt||null};
  });
  await writeFile(`artifacts/globalti-database-reconciliation-${apply?"applied":"preview"}-2026-10-26.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{await store.close();}
