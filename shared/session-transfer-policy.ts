/** Pause session reuse after a reported sign-out in the original browser.
 * This is containment, not proof of the provider's reason for ending a login.
 */
export function sessionTransferSuspension(portal: string, _authorizedRetest = false) {
  return portal === 'linkedin'
    ? 'A transferência da sessão do LinkedIn para a nuvem está temporariamente suspensa após desconexões do login original. Use a extensão atualizada para verificar o login no próprio Chrome, sem transferir cookies. O envio automático pelo LinkedIn continua indisponível.'
    : null;
}
export const linkedinRetestNotice = 'Conexão em teste disponível para todos os usuários autenticados. Cada pessoa conecta sua própria conta. A causa da saída anterior ainda não foi resolvida; reutilizar a sessão no navegador da nuvem pode voltar a encerrar o login original. Este teste não habilita candidaturas automáticas pelo LinkedIn.';
export const linkedinLocalNotice='O LinkedIn é verificado no seu Chrome. Cookies, tokens e senhas do LinkedIn permanecem no navegador. Esta verificação registra apenas que o login foi reconhecido; ela não habilita candidaturas automáticas pelo LinkedIn.';
export type LocalLoginObservation={observedAt:string;expiresAt:number;extensionVersion:string};
export type BrowserConnectionAccess={available:boolean;unavailableReason?:string|null;sessionRetest?:boolean;notice?:string|null;mode?:'local-browser'|'cloud-session';localLogin?:LocalLoginObservation|null};
