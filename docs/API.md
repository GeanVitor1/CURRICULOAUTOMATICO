# API REST · EmpreGatos

Base: `/api`. Respostas são JSON, exceto download de arquivos e o callback OAuth (HTML). Erros retornam `{ "error": "mensagem" }`. Rotas de dados exigem sessão da conta.

Operações mutativas exigem `X-Orbita-Request: 1` e, quando presente, `Origin` autorizada em `APP_ORIGIN`. O nome técnico histórico do cabeçalho e cookie foi preservado para compatibilidade. Cookies identificam a conta; o cliente não escolhe o ID do proprietário. `?demo=true` é rejeitado: o gerador de demonstrações foi removido.

## Endpoints

| Método | Rota | Comportamento |
|---|---|---|
| GET | `/health` | Verificação de banco e serviço |
| POST | `/auth/register` | Nome, e-mail e senha (10–128 caracteres); cria sessão |
| POST | `/auth/login` | E-mail e senha; cria sessão |
| GET | `/auth/me` | Identidade da sessão |
| POST | `/auth/logout` | Revoga sessão e cookie |
| GET | `/workspace` | Snapshot do workspace e infraestrutura |
| GET | `/workspace?summary=true` | Resumo: contagens reais, oito vagas e vagas associadas às candidaturas |
| GET | `/automation/sites` | Sites da entrevista e disponibilidade de busca/envio por site |
| POST | `/oauth/linkedin/start` | Cria autorização com estado vinculado à conta; retorna URL OAuth oficial com escopos `openid profile email` |
| GET | `/oauth/linkedin/callback` | Consome estado uma vez, troca código no servidor e consulta `userinfo`; informa sucesso à janela de origem sem retornar tokens |
| POST | `/connections/:portal/open` | Abre login privado do site; retorna imagem da janela e campos visíveis, sem valores |
| POST | `/connections/:portal/action` | Clique, preenchimento, tecla ou rolagem na sessão do proprietário |
| POST | `/connections/:portal/confirm` | Verifica autenticação e salva sessão cifrada; `profileResumeId` opcional confirma currículo do site |
| POST | `/connections/:portal/close` | Fecha a janela temporária de login |
| DELETE | `/connections/:portal` | Fecha login e remove sessão salva do site |
| PUT | `/interview` | Salva etapa e respostas; ao confirmar aplica critérios, aprova currículo e inicia a primeira busca quando solicitado |
| PUT | `/onboarding` | Salva etapa/respostas; `complete:true` confirma preferências |
| PUT | `/guide` | Salva etapa, ativação, pausa e conclusão do guia didático por conta |
| PUT | `/profile` | Perfil validado, com confirmação explícita |
| GET | `/intelligence` | Configuração pública do provedor, sem retornar chave |
| GET | `/intelligence/models` | Catálogo atual de modelos gratuitos Zen e elegibilidade no conector |
| POST | `/intelligence/test` | Teste autenticado com texto sintético, sem currículo ou dados pessoais |
| PUT | `/intelligence` | Provedor, modelo, habilitação, chave opcional e opção de remover segredo |
| PUT | `/filters` | Filtros completos validados |
| GET | `/jobs` | Filtros objetivos + `page`, `pageSize` (máx. 100), `search`, `radar`, `tab=all/compatible/saved`, `sort=score/recent` |
| GET | `/jobs/:jobId` | Anúncio e candidatura associados à conta |
| POST | `/jobs/:jobId/analyze` | Explicação externa opcional; preserva critérios e bloqueios determinísticos |
| POST | `/jobs` | Importa uma vaga e deduplica |
| PATCH | `/jobs/:jobId` | `saved`, `discarded`, `blockCompany` |
| POST | `/sources` | Plataforma, empresa, identificador público e habilitação |
| GET | `/source-registry` | Empresas com murais públicos verificados e cobertura explicitada |
| GET | `/source-catalog` | Metadados do cache público compartilhado; exclui termos Adzuna pessoais |
| DELETE | `/sources/:sourceId` | Remove fonte |
| POST | `/discover` | Enfileira tarefa persistente; retorna ID/status/mensagem. O worker atualiza o mesmo registro de execução |
| POST | `/applications` | `jobId`, `resumeId` opcional; prepara candidatura assistida com currículo aprovado |
| POST | `/applications/manual` | `jobId`, `date`, `confirmation: true`, `note`; registra envio externo |
| PATCH | `/applications/:appId` | Status permitido, `confirmation`, observações |
| POST | `/resumes` | Multipart `file`: PDF ou DOCX, até 5 MB |
| PUT | `/resumes/draft` | Rascunho do construtor, persistido e isolado por conta |
| POST | `/resumes/build` | Gera PDF com respostas reais, salva versão não aprovada e retorna `resumeId` |
| PATCH | `/resumes/:resumeId` | `approved`: aprovação do arquivo |
| GET | `/resumes/:resumeId/download` | Original privado, exclusivo da conta |
| PUT | `/routine` | `enabled`, `mode`, `time`, `dailyLimit`, `minScore` |
| POST | `/search-profiles` | Nome, filtros e modo; salva perfil de busca |
| POST | `/search-profiles/:profileId/activate` | Alterna filtros e modo do workspace |
| PATCH | `/notices` | Marca notificações como lidas |
| GET | `/export` | Exporta workspace em JSON |
| DELETE | `/account` | Senha atual; apaga registros e currículos privados |

Modelos completos estão em `shared/types.ts`; validações em `server/validation.ts`. Perfil e filtros usam objetos completos, não patches parciais. Status permitidos e transições estão em `shared/types.ts`.

## Contrato do adapter de envio autorizado

O adapter externo deve ser um serviço sob autorização explícita do operador e da plataforma/empresa receptora. Este contrato **não fornece credenciais ou autorização para portais**.

Requisição enviada pelo servidor:

```http
POST /applications
Authorization: Bearer <segredo>
Idempotency-Key: <uuid-da-candidatura>
Content-Type: application/json
```

```json
{
  "applicationId": "uuid",
  "job": { "title": "Cargo", "url": "https://vaga-oficial", "company": "Empresa" },
  "profile": { "name": "Pessoa", "skills": ["C#", ".NET"], "confirmed": true },
  "resume": { "name": "curriculo.pdf", "text": "Texto real da versão aprovada" }
}
```

`profile` inclui o modelo completo confirmado. Em fontes do tipo portal, `resume.file` contém o original aprovado com nome, MIME e base64. Em fontes do tipo `authorized`, o contrato histórico envia o texto; o adapter deve implementar suas exigências de arquivo. Perguntas ausentes exigem intervenção, sem inventar respostas.

Resposta de sucesso obrigatória:

```json
{ "status": "sent", "receipt": "identificador-verificavel-do-envio" }
```

A confirmação precisa representar envio concluído no serviço receptor. Um `200` sem recibo não confirma candidatura.

Se a resposta incluir `applicationId`, ele deve corresponder à requisição. Recibo vazio ou composto só de espaços não confirma envio. `status: "action_required"` resulta em **Requer ação manual**; `status: "not_submitted"` em HTTP 200 ou 422 resulta em **Falha no envio**. Demais respostas, falhas de rede e ausência de confirmação resultam em **Resultado desconhecido**.

A candidatura passa por **Enviando** antes da chamada externa, com claim atômico no banco. O worker recupera claims interrompidos após 150 segundos como **Resultado desconhecido**, sem reenvio automático. Pausar impede novos envios; uma operação já iniciada pode concluir.

`/automation/sites` separa `identityConnected`, `connected`, `sessionState`, `verifiedAt`, `discovery`, `automatic`, `authMethod`, `applicationMethod` e `limitation`. OAuth de identidade não altera `automatic`. Endpoints de navegador exigem `PORTAL_BROWSER_AUTHORIZED` para aquele provedor; a busca automatizada LinkedIn exige `PORTAL_DISCOVERY_AUTHORIZED`. Não se deve configurar essas permissões sem autorização do serviço.

Recusa definitiva: HTTP 422 com `{ "status": "not_submitted" }`. Demais falhas, timeout de 25 segundos, redirecionamento e respostas ambíguas tornam o resultado desconhecido. O adapter deve honrar a chave de idempotência e nunca duplicar um envio com a mesma chave.

Antes de qualquer chamada externa, a aplicação persiste a tentativa como resultado desconhecido. Isso evita repetir automaticamente uma operação cujo resultado foi perdido durante uma reinicialização. Um resultado desconhecido exige verificação humana no serviço oficial e atualização manual do status.

## Limites operacionais

O dashboard usa o resumo e a interface de vagas usa paginação no servidor via TanStack Query. `/jobs` ainda lê a coleção JSONB limitada a 2.000 vagas por conta antes de filtrar. Para escala multiusuário elevada, normalize vagas/candidaturas em tabelas próprias e faça paginação/filtros no SQL.

Chamadas externas têm timeout, limites e retentativas controladas. Cada fonte pode falhar sem descartar resultados de outras. A fila PostgreSQL coalesce tarefas por conta, reserva trabalho com renovação periódica e permite uma recuperação após interrupção. Falhas definitivas não repetem buscas cegamente. O cache ATS dura 15 minutos e a sincronização de Jobicy respeita pelo menos uma hora. Explicações/consentimento/configuração individual não são compartilhados no catálogo público.
