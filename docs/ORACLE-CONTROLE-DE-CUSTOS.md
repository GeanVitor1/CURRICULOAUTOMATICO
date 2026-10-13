# Oracle: conta gratuita e controles de custo

Estado de 13/10/2026: o usuário criou a conta e informou que a página de pagamentos exibe “O provisionamento da sua conta está em andamento”. O plano e os recursos da conta ainda não foram verificados. A ferramenta de navegador também falhou antes de acessar as abas; nenhuma configuração foi aplicada no painel Oracle.

## Controle principal

Conforme a documentação Oracle, o cartão não é cobrado por uso de uma conta Free Tier enquanto ela não for convertida para uma conta paga. Autorizações temporárias de verificação do cartão são distintas de cobranças de consumo. Confirmar o tipo de conta após o provisionamento e manter Free Trial/Always Free, sem upgrade para Pay As You Go ou outro plano pago.

O fim dos créditos de avaliação não autoriza automaticamente cobrança no cartão. Recursos pagos criados com créditos podem ser retomados; para esta implantação, usar apenas recursos Always Free elegíveis na região principal.

Fontes: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm e https://www.oracle.com/cloud/free/faq/.

## Cotas preparadas, ainda não aplicadas

O arquivo `deploy/oracle-quota-policy.template.txt` é um rascunho para a política de cotas, não um controle já ativo. Antes de salvar, substituir `__HOME_REGION__` pelo identificador da região principal e `__HOME_AD__` pelo identificador de domínio de disponibilidade exigido pelo painel. Conferir a lista de recursos e as políticas existentes primeiro. As regras têm alcance de toda a tenancy e limitam também outros projetos dessa conta.

A política zera as famílias de CPU, memória e volumes e libera A1 somente no domínio selecionado: 2 OCPUs, 12 GB de RAM, 50 GB entre discos de inicialização e volumes. Libera até cinco backups apenas na região principal. Bloqueia configurações de escalonamento automático e pools de instâncias. A ordem das linhas importa: a liberação deve ficar após os bloqueios, na mesma política.

Essas cotas são por recurso/domínio/região, não um teto de dinheiro. Restringir a um único domínio evita multiplicar os limites entre domínios. A cota de armazenamento não define a classe de desempenho do disco; usar somente o desempenho coberto pela oferta gratuita. Novos serviços, tráfego excedente e alterações feitas por um administrador não ficam automaticamente protegidos por esse rascunho.

Aplicação futura: **Governance & Administration → Limits, Quotas and Usage → Compartment Quotas** (os rótulos podem variar com o idioma). Validar e salvar a política após confirmar a conta gratuita e os identificadores. Depois, consultar as cotas efetivas e conferir a configuração da VM antes de criá-la. A validação do Oracle ainda está pendente.

Referências:

- Sintaxe, escopo por domínio e precedência: https://docs.oracle.com/en-us/iaas/Content/Quotas/Concepts/quota_policy_syntax.htm
- Nomes das cotas de CPU, memória e escalonamento: https://docs.oracle.com/en-us/iaas/Content/Quotas/Concepts/resourcequotas_topic-Compute_Quotas.htm
- Volumes e backups: https://docs.oracle.com/en-us/iaas/Content/Quotas/Concepts/resourcequotas_topic-Block_Volume_Quotas.htm

## Orçamento e alerta

Um orçamento Oracle gera avisos; ele não interrompe serviços nem impede uma fatura. A avaliação dos alertas é periódica, aproximadamente a cada 24 horas, por isso não deve ser usado como trava de cobrança. Configurá-lo como aviso adicional após confirmar a conta, usando o menor valor positivo aceito pelo painel e alerta de gasto real para o e-mail do titular.

Fonte: https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm.

## Conferência antes de hospedar

Confirmar conta Free Tier, região principal, selo Always Free, A1 dentro de 2 OCPUs/12 GB totais, disco inicial de 50 GB com desempenho elegível, ausência de recursos pagos e ausência de escalonamento automático. Se não houver capacidade gratuita, aguardar outra disponibilidade; não substituir por uma máquina paga. Esta verificação e a aplicação das cotas dependem do provisionamento da conta e do acesso ao painel.

Caso a conta já seja paga, não afirmar que um orçamento ou estas cotas garantem cobrança zero: a Oracle informa que não oferece downgrade normal após o upgrade. É necessário revisar recursos e condições da conta antes de continuar.
