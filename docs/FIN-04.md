# FIN-04 — Expiração da sessão por inatividade

## Implementação

O AuthProvider global continua sendo a única fonte de estado de autenticação.
O monitor usa o cliente Supabase existente e o logout existente, com escopo
`local` para encerrar a sessão deste navegador sem desconectar outros dispositivos.
O logout manual mantém o escopo global original.

- Aviso após 25 minutos e logout após 30 minutos, configurados em
  `src/utils/idleSession.ts` (`IDLE_WARNING_TIME` e `IDLE_TIMEOUT`).
- Clique, pointerdown, teclado, toque e mudança de pathname reiniciam o prazo,
  desde que a sessão ainda não tenha expirado. Eventos sintéticos de DOM são ignorados.
- Foco, visibilidade, pageshow, refresh de token e inicialização somente verificam
  o prazo; não contam como atividade.
- Horário persistido em `localStorage`, com prefixo
  `finance-smart:lastActivityAt:`, separado por usuário e session_id do JWT.
  Somente o identificador é extraído; tokens não são copiados para esse registro.
- Eventos storage sincronizam as abas. O valor 0 marca uma sessão expirada,
  impedindo sua reativação enquanto o logout é concluído.
- Conteúdo fica bloqueado durante a validação inicial e após expiração.
  O redirecionamento completo para /login ocorre após o logout do Supabase,
  descartando também estado de páginas e cache do roteador.
- O proxy existente continua verificando a autenticação nas rotas protegidas.
  Não houve alteração de banco, RLS, regras financeiras ou validade do JWT.
- O modal usa dialog nativo para foco e navegação por teclado.

## Testes automatizados

Execute:

```powershell
node --test src/utils/idleSession.test.ts
npx eslint src/providers/AuthProvider.tsx src/components/auth/IdleSessionWarning.tsx src/services/authService.ts src/utils/idleSession.ts src/utils/idleSession.test.ts
npx tsc --noEmit --incremental false
npm run build
```

Os testes do monitor usam relógio e agendamento controlados e cobrem os limites
exatos, atividade contínua, aviso/continuação, persistência, reabertura,
abas, suspensão, descarte do monitor, registros inválidos e troca de sessão.

## Roteiro manual

Para agilizar em desenvolvimento, altere temporariamente as constantes para
aviso em 25 segundos e expiração em 30 segundos. Restaure os valores de
25 e 30 minutos antes de entregar. O texto do modal permanece o texto de
produção solicitado (5 minutos).

1. Faça login por senha e, se habilitado, por Google. Confira acesso normal.
2. Interaja repetidamente por mais de um prazo de expiração. Deve permanecer conectado.
3. Pare de interagir. No limite de aviso, confira título, mensagem, foco e botão.
4. Clique em Continuar conectado; confira fechamento do modal e novo prazo completo.
   Repita usando teclado, toque e navegação.
5. Deixe vencer. Confira logout no Supabase, /login e exigência de novo login
   ao digitar /dashboard ou usar Voltar.
6. Antes do vencimento, recarregue a página. Confira que o valor da chave de
   atividade não mudou e que o aviso/expiração respeitam o horário original.
7. Feche a aba ou navegador e reabra antes e depois do prazo. Antes, preserve
   o prazo restante; depois, bloqueie o conteúdo e efetue logout.
8. Abra duas abas. Interaja em uma e confira que a outra mantém a sessão e fecha
   o aviso. Deixe ambas ociosas e confira logout em ambas.
9. Suspenda/oculte uma aba além do prazo. Ao voltar, nem o primeiro clique deve
   reviver a sessão.
10. Teste Sair manualmente com duas abas e depois um novo login. A nova sessão
    deve iniciar um novo prazo.
11. Desconecte a rede antes de expirar. Confira interface bloqueada e mensagem
    de nova tentativa. Reconecte e confira conclusão do logout e /login.

## Observações

- Validar login real e o fluxo de navegador requer uma sessão de teste no Supabase.
- Sem rede, o SDK pode falhar ao revogar a sessão; a aplicação permanece bloqueada
  e tenta novamente a cada 5 segundos após cada falha. Não simula sucesso de logout.
- Se localStorage estiver indisponível, a aplicação bloqueia e solicita logout,
  pois não consegue garantir persistência do prazo.
- Sessões anteriores à implantação sem registro são adotadas no primeiro acesso;
  não há como reconstruir a última interação anterior. Limpar os dados do navegador
  remove o histórico de inatividade.
- Este é um controle de inatividade do navegador, não uma política de autorização
  no servidor. Não altera a validade de access tokens já emitidos pelo Supabase.
