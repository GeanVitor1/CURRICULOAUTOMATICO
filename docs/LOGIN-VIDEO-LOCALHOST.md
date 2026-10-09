# Vídeo do login e reinício local — 09/10/2026

O login usa `Video/output/NOVOVIDEO.mp4` diretamente: H.264, 1280 × 720, 30 fps, 5,9 segundos. Vite copia o arquivo sem recompressão; o SHA-256 do original e do MP4 no build é idêntico. A reprodução é automática, sem som, em loop e inline no celular. O enquadramento continua quadrado, com corte central nas laterais. Há somente um player montado por largura de tela. Pausar mantém o quadro atual; movimento reduzido usa o primeiro quadro em PNG e não carrega o MP4. O cadastro utiliza a mesma animação do login, no desktop e no celular.

O serviço local foi iniciado em segundo plano com janelas ocultas. Login e API respondem em `http://localhost:5173/login` e `/api/health`. O banco recuperado também passou por cadastro, logout, login, leitura do workspace e exclusão de uma conta temporária de QA.

## Recuperação do banco

O PGlite abortava ao iniciar porque `pg_control` apontava para `0/BDEC68`, um registro que não era de checkpoint. O arquivo de controle tinha CRC válido. Foi encontrado um checkpoint de desligamento com CRC válido em `0/BDEBF0`; todos os campos da cópia do checkpoint eram iguais aos do controle, exceto o ponteiro de redo.

O banco inteiro foi copiado antes de qualquer reparo. A recuperação ocorreu em uma segunda cópia: somente os dois ponteiros e o CRC de `pg_control` foram corrigidos. Nenhum segmento WAL foi removido ou reinicializado. O PostgreSQL executou sua recuperação normal, reaplicando os registros posteriores até `0/C95690`.

Após a recuperação: 4 contas, 5 workspaces, 219 vagas, 4 currículos e 13 candidaturas legíveis; nenhum workspace sem proprietário e nenhum arquivo original de currículo ausente. A cópia foi fechada e reaberta antes da ativação. Hashes das linhas das tabelas e um relatório sem dados pessoais estão em `.data/login-video-restored-table-checksums.json` e `.data/login-video-database-recovery.json`.

O cluster original ficou preservado em `.data/backups/postgres-original-before-login-video`; a cópia completa anterior ao diagnóstico está em `.data/backups/postgres-before-login-video-1791553784178`. A chave de criptografia, uploads e sessões dos portais permaneceram no diretório original. O script pontual de recuperação está em `.data/recover-login-video-checkpoint.mjs`; não é executado automaticamente pela aplicação.

Havia observadores de API antigos no ambiente. Eles foram encerrados antes da recuperação. A aplicação agora reserva o banco local por processo antes de abrir o PGlite, impedindo que uma segunda API abra o mesmo diretório. A trava é removida após o fechamento normal e pode ser recuperada quando o processo proprietário já terminou. PostgreSQL externo continua disponível para múltiplos processos.

Referências técnicas usadas no diagnóstico: [PGlite API e debug](https://pglite.dev/docs/api), [layout de controle e checkpoint PG17 na proposta de recuperação do PGlite](https://github.com/electric-sql/pglite/pull/994). A proposta de reset de WAL não foi aplicada: os segmentos originais foram preservados.

## Validação

Build e TypeScript aprovados, 142 testes unitários/API aprovados. O cenário de artes da página e autenticação passou no navegador. A verificação real do vídeo confirmou resolução, autoplay, áudio desativado, repetição após o fim, pausa/retomada, versão mobile, movimento reduzido e ausência de erros JavaScript. Capturas: `artifacts/login-video-1440.png` e `artifacts/login-video-375.png`.
