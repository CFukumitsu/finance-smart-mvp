# FIN-04 — Correção e validação

## Resultado da investigação

A versão anterior foi preservada e executada em um navegador Edge isolado,
com o AuthProvider, LoginForm e SDK Supabase reais, contra um servidor Auth
simulado. A instrumentação temporária registrou última atividade, horário,
diferença, atividade/passividade, agendamento e expiração.

Foram reproduzidas estas falhas:
- Toda mudança de pathname, inclusive programática, era tratada como atividade.
- Uma sessão restaurada sem histórico recebia Date.now() na inicialização.
- O botão do aviso podia chamar a renovação com um clique sintético.

Na reprodução separada de uma aba completamente parada, a versão anterior
expirou aos 30 segundos, inclusive com refresh Supabase a cada 4 segundos.
Os logs mostraram que os refreshes preservavam o timestamp original.
Portanto, não foi comprovada a causa específica do relato de uma hora em
produção; atribuí-la ao refresh automático seria incorreto. A inspeção somente
de leitura dos bundles públicos da URL documentada no projeto confirmou que
a versão anterior estava publicada com os limites de 25/30 minutos, mas não
permite determinar qual bundle/estado estava na aba durante a ocorrência.

## Correção

- O monitor não cria histórico na inicialização. Registro ausente, inválido ou
  vencido exige logout; uma sessão/refresh token válido não concede prazo novo.
- Somente login explicitamente concluído e interação confiável do usuário
  registram atividade. Cliques, teclado e toque incluem a navegação iniciada
  pelos controles da aplicação. Mudanças automáticas de rota não contam.
- Verificações passivas (timer, eventos Auth, foco, pageshow, storage e
  visibilidade) não escrevem atividade nem reiniciam um timer com prazo igual.
- A validade é checada antes de aceitar a primeira interação ao retornar.
- Login por senha grava o horário após sucesso. OAuth e convite transportam
  somente o identificador da sessão e o horário do login confirmado em um
  cookie transitório; o provider importa esse horário uma vez sem renová-lo,
  sem sobrescrever histórico existente ou marcador de expiração.
- O aviso ignora eventos sintéticos, inclusive no botão Continuar conectado.
- Mantidos o logout Supabase local, a sincronização entre abas, o bloqueio
  enquanto encerra a sessão e o redirecionamento completo para /login.
- Nenhuma alteração financeira, de banco, RLS ou validade global de JWT.
- Logs de diagnóstico existem somente no bundle temporário de testes.
  Não são incluídos na aplicação nem no build de produção.

## Tempos finais

Em `src/utils/idleSession.ts`:
- `IDLE_WARNING_TIME = 25 * 60 * 1000`
- `IDLE_TIMEOUT = 30 * 60 * 1000`

O loader de teste troca essas constantes por 25/30 segundos somente no bundle
temporário, gravado fora do projeto. O código de produção permanece 25/30 minutos.
A opção `--production-times` não aplica a troca e usa relógio controlado no
navegador, instalado antes de carregar a aplicação.

## Como executar

```powershell
node --test src/utils/idleSession.test.ts src/utils/authProviders.test.ts
node scripts/test-idle-session-browser.cjs
node scripts/test-idle-session-browser.cjs --production-times
npm run build
```

O teste de navegador precisa de Playwright e Edge já instalados. Não foi
adicionada dependência à aplicação. Quando Playwright estiver no runtime
externo, defina `CODEX_NODE_MODULES` com o diretório node_modules desse runtime.

Para reproduzir a versão anterior, `--baseline` usa `FIN04_BASELINE` com as
cópias `baseline-AuthProvider.tsx`, `baseline-idleSession.ts` e
`baseline-authService.ts`. Os relatórios JSON com eventos e resultados ficam
no diretório temporário informado ao terminar cada execução.

## Cobertura e limites

A suíte de navegador verifica login, eventos passivos, histórico ausente,
aviso, clique sintético, Continuar conectado, tela parada, aba fechada,
recarga após vencimento (incluindo página congelada no teste em segundos),
segundo plano, duas abas, novo login, logout manual, minimização e fechamento
do navegador inteiro com reabertura do mesmo perfil persistente.

Na minimização, o teste confirma pelo protocolo do navegador que a janela está
minimizada e que o documento perdeu o foco. Neste ambiente, o Edge ainda
reporta visibilityState=visible; esse valor é registrado, não falsificado.
A suspensão de execução é coberta separadamente pelo teste de página congelada.

Os testes usam HTTP Auth simulado e o SDK real: comprovam logout, limpeza
local e exigência de novo login no ambiente isolado. Não equivalem a uma
validação autenticada em produção. Não houve alteração nem acesso a dados
financeiros de produção.

Sem conexão, a interface permanece bloqueada e o logout é tentado novamente.
Sessões antigas sem histórico válido precisarão autenticar novamente.
O controle continua sendo de inatividade no navegador; não altera a validade
de tokens já emitidos nem substitui autorização/RLS no servidor.

## Resultados finais da correção

- 20 testes unitários de inatividade/autenticação: aprovados.
- 12 cenários de navegador com 25/30 segundos e espera real: aprovados.
- 12 cenários com constantes de produção de 25/30 minutos e relógio controlado: aprovados.
- Lint de todos os arquivos alterados/criados pelo FIN-04: aprovado.
- Build de produção (npm run build): aprovado.
- git diff --check dos arquivos da correção: aprovado.
- tsc isolado: aponta o erro preexistente TS2578 em
  src/utils/closingAccounts.test.ts:3 (diretiva @ts-expect-error duplicada).
  Esse arquivo foi preservado.

| Cenário de navegador | 25/30 segundos | 25/30 minutos, relógio controlado |
| --- | --- | --- |
| Configuração de tempos | Aprovado | Aprovado |
| Refresh Auth, foco e rota automática não renovam atividade | Aprovado | Aprovado |
| Histórico ausente exige login | Aprovado | Aprovado |
| Aviso, clique sintético ignorado e Continuar conectado | Aprovado | Aprovado |
| Tela parada: logout e login obrigatório | Aprovado | Aprovado |
| Fechar e reabrir aba após o prazo | Aprovado | Aprovado |
| Refresh após prazo | Aprovado, com página congelada | Aprovado |
| Aba em segundo plano | Aprovado | Aprovado |
| Duas abas: atividade e logout sincronizados | Aprovado | Aprovado |
| Novo login e logout manual | Aprovado | Aprovado |
| Janela minimizada: logout ao vencer | Aprovado | Aprovado |
| Fechar navegador e reabrir perfil persistente | Aprovado | Aprovado |

Confirmado em ambiente isolado: ao reabrir após mais de 30 minutos desde a
atividade registrada, o SDK encerra a sessão e a tela exige novo login.
A autenticação HTTP é simulada; não foi realizado login de teste em produção.

Tempos finais conferidos: aviso 25 minutos e expiração 30 minutos.
Não foram feitos commit, push ou deploy.
