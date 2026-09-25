# Finance Smart — implementação autorizada

## Ambiente

Implementação das fases 0–10 autorizada pelo usuário. PROD permanece intocado: sem migrations, alterações de dados, schema ou deploy.

`.env.dev` e `.env.local` apontam para o mesmo Supabase remoto. Seus nomes não comprovam isolamento. Validações de escrita devem usar banco local explicitamente identificado; não executar scripts de clonagem de PROD.

## Contratos aprovados

- Saldo atual: saldo anterior mais movimentos da competência até a data de referência atual, independentemente do status.
- Saldo futuro: saldo anterior mais todos os movimentos da competência.
- Saldo de fechamento: saldo atual da competência no instante de fechamento, preservando a referência temporal.
- Filtros visuais não alteram o conjunto usado para calcular saldo.
- Cada linha afeta somente sua própria conta; destination_account_id não gera crédito adicional.
- Transferências têm duas pontas vinculadas e mutações atômicas, sem receita/despesa operacional.
- Integrações Bankroll e investimentos preservam seus contratos próprios.
- Conversões preservam os valores nativos debitados e recebidos. IOF integra a tarifa total; não há débito duplicado de custos.
- Custo histórico difere de valor de mercado. Custo desconhecido não equivale a zero.
- Moeda antiga não confirmada permanece desconhecida até confirmação explícita.
- Ausência de cotação produz patrimônio parcialmente consolidado, nunca taxa implícita 1.

## Fase 0 — em andamento

- Repositório inicialmente limpo, HEAD 7386113.
- Lidas instruções da raiz, .codex/AGENTS.md, STANDARDS e guias Next locais.
- Confirmados accounts.currency, transações numeric(12,2), RPCs de investimentos e transferências comuns sem vínculo operacional.
- Confirmada divergência de dupla contagem por destino no SQL do Bankroll.
- Docker instalado, inicialmente parado; solicitado início local. Schema local ainda não validado.
- Nenhuma migration executada. Nenhuma fase declarada concluída.

## Ordem de execução

0. Contratos e schema local.
1. Bankroll, integridade de transferências e saldo.
2. Autocomplete.
3. Multimoeda, Wise e custo histórico.
4. Market Data reutilizando câmbio existente.
5. Market Watch e metas.
6. Insights determinísticos.
7. Dashboard e patrimônio.
8. Fechamentos, conciliação e relatórios.
9. Homologação funcional e integração.
10. Acabamento e plano de PROD sujeito a autorização específica.
