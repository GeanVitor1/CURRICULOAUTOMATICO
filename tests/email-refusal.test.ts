import { expect, it } from "vitest";
import type { Application } from "../shared/types";
import { emailExplicitlyRejected } from "../server/submission-consent";
it("allows individual review after explicit Gmail refusal, never ambiguous or confirmed delivery", () => {
 const a={status:"Requer ação manual",singleSubmission:{method:"email"},history:[{actor:"Sistema",message:"O Gmail recusou o envio. [GMAIL_REJECTED HTTP 403: PERMISSION_DENIED / accessNotConfigured] Confira a conexão, a ativação da API e os limites da conta."}]} as Application;
 expect(emailExplicitlyRejected(a)).toBe(true);
 expect(emailExplicitlyRejected({...a,receipt:"real-id"})).toBe(false);
 expect(emailExplicitlyRejected({...a,status:"Resultado desconhecido"})).toBe(false);
 expect(emailExplicitlyRejected({...a,history:[{at:"",actor:"Sistema",message:"O Gmail não confirmou o resultado. Não repetir sem conferir os enviados."}]})).toBe(false);
 expect(emailExplicitlyRejected({...a,history:[{at:"",actor:"Usuário",message:a.history[0].message}]})).toBe(false);
});
