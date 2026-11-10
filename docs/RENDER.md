# Backend no Render + front no GitHub Pages

Front: https://geanvitor1.github.io/CURRICULOAUTOMATICO/ (GitHub Actions, `.github/workflows/pages.yml`).
API: serviço Docker gratuito no Render, descrito em `render.yaml`.

## 1. Credencial do Firestore (a Vercel usava OIDC, que só existe lá)
1. Google Cloud Console → projeto do Firebase → IAM → Contas de serviço.
2. Use a conta já usada pela Vercel (`GCP_SERVICE_ACCOUNT_EMAIL`) ou crie uma com papel **Cloud Datastore User**.
3. Chaves → Adicionar chave → JSON. Guarde o arquivo; ele é secreto.

## 2. Criar o serviço
1. https://dashboard.render.com → New → **Blueprint** → escolha o repositório `CURRICULOAUTOMATICO`.
2. Preencha as variáveis marcadas como secretas:
   - `FIREBASE_PROJECT_ID`: o mesmo da Vercel.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: conteúdo do JSON (ou o JSON em base64).
   - `ENCRYPTION_KEY`: **a mesma da Vercel** (senão currículos e sessões salvos não abrem).
   - `GEMINI_API_KEY`: a mesma da Vercel (opcional).
3. Aguarde o deploy e anote a URL, ex.: `https://empregatos-api.onrender.com`.
4. Teste: `https://empregatos-api.onrender.com/api/health`.

## 3. Apontar o front para a API
GitHub → repositório → Settings → Secrets and variables → Actions → aba **Variables** →
New repository variable: `VITE_API_URL` = URL do Render (sem barra no final).
Depois: Actions → "Deploy visualização (GitHub Pages)" → Run workflow.

## Limitações
- Plano gratuito dorme após 15 min sem uso; a primeira chamada leva ~30–50 s.
- Filas e Sandbox da Vercel não existem no Render: o envio automático por navegador não roda lá.
- Login usa cookie entre domínios (SameSite=None). Safari e navegadores que bloqueiam
  cookies de terceiros podem não manter a sessão; a solução definitiva é um domínio próprio
  com front e API no mesmo site (ex.: app.seudominio.com e api.seudominio.com).
- Login com Google precisa do callback do Render cadastrado no Google Cloud.
