# Configurações — `/lojista/configuracoes`

## 0. Tradução do pedido

Mesmo padrão dos últimos pedidos: veio em termos genéricos (Prisma,
`company_id`/`store_id`, roles Admin/Atendente/Caixa, `require_cpf` na
Store). Nada disso existe aqui. Traduzido pra arquitetura real: tenant
único (`lojista.id_lojista = auth.uid()`), sem hierarquia empresa→loja,
sem campo de CPF configurável (explicado na seção 3).

## 1. Levantamento — o que já existia antes de escrever qualquer código

| Item pedido | Já existia? | Onde |
|---|---|---|
| Dados da loja | ✅ Sim | `/lojista/perfil` (`PerfilLojistaForm.tsx`) |
| Horários de funcionamento | ✅ Sim | `/lojista/horarios` |
| Gestor de Agendamentos (toggle do Kanban) | ✅ Sim, mas dentro de Perfil da Loja | coluna `lojista.kanban_ativo` (migration 013) + `alternarKanbanAction` |
| Agendamento Online (toggle) | ❌ Não existia nada equivalente | — |
| `require_cpf` por loja | ❌ Não existe, e não devia — CPF já é obrigatório pra todo cliente da plataforma, sempre, independente da loja (`cliente.cpf NOT NULL`, `cadastroClienteSchema`) | — |
| Equipe / Funcionários | ✅ Sim | `/lojista/funcionarios` |
| Usuários e permissões | ✅ Parcialmente — as duas flags `pode_gerenciar_agenda`/`pode_gerenciar_servicos` de `funcionario` já são "as permissões" que existem | `/lojista/funcionarios` (modal de cadastro/edição) |
| Notificações | ❌ Não existe nenhum sistema de notificação (e-mail/SMS/push) no projeto | — |

**Regra seguida à risca**: nada do que já existia foi recriado. Configurações
é um HUB que organiza e leva pras telas reais — só duas coisas são
genuinamente novas (o toggle de Agendamento Online e as duas páginas
informativas de Permissões/Notificações, que não tinham onde morar).

## 2. Estrutura implementada

`/lojista/configuracoes` — 4 grupos, cada item é um `<Link>`:

- **Loja** → Dados da loja (`/lojista/perfil`, reutilizada) · Horários de funcionamento (`/lojista/horarios`, reutilizada)
- **Agendamentos** → Gestor de Agendamentos e Agendamento Online, ambos em `/lojista/configuracoes/agendamentos` (nova página, com âncoras `#kanban`/`#online` pra cada item abrir direto na seção certa)
- **Operação** → Equipe (`/lojista/funcionarios`, reutilizada)
- **Sistema** → Usuários e permissões (`/lojista/configuracoes/permissoes`, nova) · Notificações (`/lojista/configuracoes/notificacoes`, nova)

Os itens de toggle (Kanban/Agendamento Online) mostram um badge
Ativado/Desativado direto no hub, sem precisar entrar na página — só
uma leitura a mais (`lojista.kanban_ativo, aceita_agendamento_online`),
sem duplicar a lógica de gravação, que continua só na página de destino.

## 3. Agendamento Online — a única coisa genuinamente nova

- **Coluna nova**: `lojista.aceita_agendamento_online BOOLEAN DEFAULT true` (migration 020) — não existia nada equivalente.
- **Ativado (padrão)**: comportamento idêntico ao de sempre.
- **Desativado**:
  - a loja some do seletor de lojas em `/cliente/novo-agendamento` (filtro `.eq('aceita_agendamento_online', true)` na query);
  - `fn_criar_agendamento` (a RPC chamada pelo PRÓPRIO cliente) passou a checar essa coluna e recusa com uma mensagem clara — dupla camada, não confia só em esconder a loja da lista;
  - `fn_criar_agendamento_lojista` (agendamento manual, criado pelo lojista) **não foi alterada** — continua funcionando sempre, como pedido explicitamente.
- **CPF**: não virou uma configuração. `cliente.cpf` já é `NOT NULL` desde a migration 001, pra qualquer cliente, de qualquer loja — não existe (nem faria sentido criar) uma exigência de CPF *por loja*, já que a conta do cliente é única na plataforma. Só documentado aqui — não aparece nada sobre isso na tela, pra não poluir a UI com um card informativo sem ação nenhuma.

## 4. Arquivos

**Criados:**
- `supabase/migrations/020_configuracoes_loja.sql`
- `src/app/lojista/configuracoes/page.tsx` (hub)
- `src/app/lojista/configuracoes/agendamentos/page.tsx`
- `src/app/lojista/configuracoes/permissoes/page.tsx`
- `src/app/lojista/configuracoes/notificacoes/page.tsx`
- `src/components/lojista/ConfigToggleCard.tsx` (card de toggle reutilizável — usado pelos dois toggles desta área, evita duplicar a UI a cada nova configuração)
- `docs/CONFIGURACOES.md`

**Modificados:**
- `src/lib/actions.ts` — `alternarAgendamentoOnlineAction` (novo, mesmo padrão de `alternarKanbanAction`); `criarAgendamentoAction` ganhou o tratamento da nova mensagem de erro.
- `src/components/lojista/PerfilLojistaForm.tsx` — removido o card do Kanban (mudou de endereço, não de lógica).
- `src/app/lojista/perfil/page.tsx` — link avisando que Kanban/Agendamento Online agora ficam em Configurações.
- `src/app/cliente/novo-agendamento/page.tsx` — filtro `aceita_agendamento_online = true` na lista de lojas.
- `src/components/layout/LojistaSidebar.tsx` — item "Configurações" adicionado; "Funcionários" e "Perfil da Loja" removidos do menu a pedido do usuário, já que ambos agora são acessados via Configurações (Operação → Equipe / Loja → Dados da loja) — as rotas/páginas em si continuam existindo e funcionando, só a entrada duplicada no menu saiu.
- `src/components/icons/index.tsx` — `IconSettings` (engrenagem), único ícone novo.

## 5. Multi-tenant e permissões

- Toda leitura/escrita usa `.eq('id_lojista', user.id)` (ou a RLS
  equivalente) — mesma dupla camada de sempre.
- `/lojista/configuracoes/*` fica dentro de `/lojista/*`, já restrito a
  `role = 'lojista'` pelo layout existente — nenhum sistema de permissão
  novo. Um funcionário não acessa nenhuma dessas telas (confirmado no
  próprio texto de `/lojista/configuracoes/permissoes`).
- `aceita_agendamento_online` é validado tanto no filtro da listagem
  (frontend) quanto dentro da RPC `fn_criar_agendamento` (backend) — a
  proteção real está na RPC, o filtro do frontend é só uma conveniência
  de UX pra não oferecer uma opção que seria recusada.

## 6. Persistência

Nenhuma configuração usa localStorage/sessionStorage/estado React puro.
`kanban_ativo` e `aceita_agendamento_online` são colunas em `lojista`,
gravadas via Server Action a cada toggle — sobrevivem a reload,
logout/login e troca de dispositivo.

## 7. Performance

- O hub faz uma única query (`select kanban_ativo, aceita_agendamento_online`) só pra mostrar os badges de status — nenhuma chamada duplicada com a página de destino.
- Nenhuma biblioteca nova.
- Páginas informativas (Permissões/Notificações) são 100% estáticas — zero query além da existente checagem de sessão do layout.

## 8. Testes realizados

`tsc --noEmit`, `eslint` e `next build` completos, sem erros. Fluxo
manual a testar depois da migration 020: abrir Configurações → conferir
os 4 grupos → Dados da loja e Horários abrem as telas de sempre → ativar/
desativar Kanban e Agendamento Online, recarregar e confirmar que
persiste → tentar agendar como cliente numa loja com Agendamento Online
desativado (não deve nem aparecer na lista) → confirmar que agendamento
interno (walk-in) continua funcionando → Equipe abre Funcionários →
Usuários e permissões e Notificações abrem as páginas informativas.

## 9. Preparado para o futuro

- `ConfigToggleCard` já está pronto pra qualquer nova configuração
  liga/desliga da loja — só precisa de uma coluna nova em `lojista` e
  uma Server Action no mesmo padrão de `alternarKanbanAction`.
- Se um sistema de notificações for implementado futuramente (e-mail/SMS
  via Resend/Twilio, por exemplo), a tela de Notificações já está no
  lugar certo pra ganhar toggles reais — só falta a infraestrutura por
  trás, que hoje não existe.
- Se um dia fizer sentido ter mais papéis além de Lojista/Funcionário, o
  caminho já documentado em `/lojista/configuracoes/permissoes` é
  ampliar as flags de `funcionario`, não criar um sistema paralelo.
