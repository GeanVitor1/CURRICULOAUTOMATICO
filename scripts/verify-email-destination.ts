import { writeFile } from "node:fs/promises";
import { verifyEmailDestination } from "../server/email-destination";
import type { Job } from "../shared/types";

// Read-only check of the publication observed in Chrome. No candidate data, token or CV.
const job = {
  title: "Full Stack Developer Júnior",
  company: "Rotha IA",
  url: "https://mercadodeti.com.br/vagas/2208-full-stack-developer-junior",
} as Job;
try {
  const destination = await verifyEmailDestination(job);
  const evidence = {checkedAt:new Date().toISOString(),readOnly:true,publication:job.url,destination,newApplicationsSent:0};
  await writeFile("artifacts/real-email-destination-2026-10-20.json",JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Public verification failed");
  process.exitCode=1;
}
