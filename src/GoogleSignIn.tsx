import { useQuery } from "@tanstack/react-query";
import { api } from "./lib";
import { Button } from "./components";

export type AuthIdentity = {
  id: string;
  name: string;
  email: string;
  hasPassword: boolean;
  googleConnected: boolean;
  recentGoogleAuthentication: boolean;
};
export function useAuthProviders() {
  return useQuery({
    queryKey: ["auth-providers"],
    queryFn: () =>
      api<{ google: boolean; googleSignInUrl: string | null }>(
        "/auth/providers",
      ),
    staleTime: 30000,
  });
}
export function googleErrorMessage(reason: string | null) {
  if (!reason) return "";
  return (
    (
      {
        denied:
          "Você cancelou o acesso com Google. Pode tentar novamente ou usar seu e-mail e senha.",
        expired: "O acesso com Google expirou. Inicie novamente.",
        unavailable:
          "O acesso com Google ainda não está disponível. Use seu e-mail e senha por enquanto.",
        account_exists:
          "Este e-mail já tem uma conta. Entre com sua senha e conecte o Google em Minha conta.",
        wrong_account:
          "Escolha a conta Google correspondente ao e-mail da sua conta EmpreGatos.",
        session_expired:
          "Sua sessão expirou. Entre novamente antes de conectar o Google.",
      } as Record<string, string>
    )[reason] || "O Google não confirmou o acesso. Tente novamente."
  );
}
export function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.7-4.1 6.1v5.1h6.6c3.9-3.6 6.1-8.9 6.1-14.9Z"
      />
      <path
        fill="#34A853"
        d="M24 44.5c5.5 0 10.1-1.8 13.5-5l-6.6-5.1c-1.8 1.2-4.2 1.9-6.9 1.9-5.3 0-9.9-3.6-11.5-8.5H5.7V33c3.4 6.8 10.3 11.5 18.3 11.5Z"
      />
      <path
        fill="#FBBC05"
        d="M12.5 27.8a12.3 12.3 0 0 1 0-7.6V15H5.7a20.5 20.5 0 0 0 0 18l6.8-5.2Z"
      />
      <path
        fill="#EA4335"
        d="M24 11.7c3 0 5.7 1 7.8 3.1l5.8-5.8A19.6 19.6 0 0 0 24 3.5 20.5 20.5 0 0 0 5.7 15l6.8 5.2A12.1 12.1 0 0 1 24 11.7Z"
      />
    </svg>
  );
}
export default function GoogleSignIn({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const providers = useAuthProviders();
  return (
    <div className="google-signin">
      {providers.data?.google && !disabled ? (
        <a
          className="button google-button full"
          href={providers.data.googleSignInUrl!}
        >
          <GoogleMark />
          Continuar com Google
        </a>
      ) : (
        <Button type="button" className="google-button full" disabled>
          <GoogleMark />
          {providers.isPending
            ? "Verificando acesso Google…"
            : "Continuar com Google"}
        </Button>
      )}
      {!providers.isPending && !providers.data?.google && (
        <p className="google-signin-help" role="status">
          {providers.isError
            ? "Não foi possível verificar o acesso com Google."
            : "O acesso com Google ainda não está disponível."}
          {providers.isError && (
            <button type="button" onClick={() => void providers.refetch()}>
              Tentar novamente
            </button>
          )}
        </p>
      )}
    </div>
  );
}
