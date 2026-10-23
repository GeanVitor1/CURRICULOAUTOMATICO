import { createHash } from "node:crypto";
import type { Application, Workspace } from "../shared/types";
/** Changes to approved answers/profile/CV allow one new preparation; an
 * unchanged blocked form must not loop just because quota is still available. */
export function preparationFingerprint(w:Workspace,a:Application) {
  return createHash('sha256').update(JSON.stringify({version:1,profile:w.profile,resumeId:a.resumeId})).digest('hex');
}
