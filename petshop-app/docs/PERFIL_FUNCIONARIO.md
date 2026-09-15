# Perfil do Funcionário — `/lojista/funcionarios/[id]`

## 0. Tradução do pedido

Mesmo padrão dos últimos pedidos: veio em termos genéricos (Prisma,
`company_id`/`store_id`, roles Admin/Atendente/Caixa, "módulo Financeiro"
separado). Nada disso existe aqui — reaproveitei a mesma arquitetura já
usada em Relatórios de Vendas e no Perfil do Cliente, inclusive a mesma
definição de faturamento e o mesmo helper de período (`src/lib/relatorios.ts`).

## 1. O que já existia (não recriado)

- **Tela de Funcionários** (`/lojista/funcionarios`) — mantida como está:
  cadastro, edição, ativar/desativar. Só o card virou clicável.
- **`toggleFuncionarioAction`** — reaproveitada como ação rápida "Ativar/
  Desativar" dentro do perfil, sem duplicar lógica.
- **Filtro de período (6 presets + personalizado)** — reaproveitado
  literalmente de `src/lib/relatorios.ts` (`calcularPeriodo`,
  `calcularPeriodoAnterior`, `PRESETS`, `variacaoPercentual`), o mesmo
  código já usado no Relatório de Vendas.
- **Definição de faturamento/venda** (`status = 'Concluído'`) — a mesma
  regra oficial, reaplicada aqui filtrada por `id_funcionario` em vez de
  pela loja inteira. Não é um cálculo novo.
- **Navegação pro perfil do Pet** (`/lojista/pets/[id]`) — reaproveitada
  na seção "Pets atendidos", sem duplicar o cadastro de pets.
- **`NovoAgendamentoModal`** — reaproveitado pra "Novo Agendamento" no
  perfil, com o profissional já vindo pré-selecionado no select opcional
  que esse modal já tinha.

## 2. O que foi adicionado

### Tela de Funcionários (evolução, não recriação)
O card de cada funcionário ficou inteiro clicável (mesmo padrão recém
aplicado em Clientes) — clicar em qualquer parte abre o perfil; os
botões Editar/Ativar-Desativar continuam funcionando por cima
(`stopPropagation`), sem precisar abrir modal nenhum pra isso.

### Perfil do funcionário (`/lojista/funcionarios/[id]`, novo)
Filtro de período no topo (Hoje/7 dias/30 dias/Este mês/Mês anterior/
Personalizado — mesmo componente visual do Relatório de Vendas) seguido
de: 8 cards de resumo, Faturamento, Atendimentos (com taxas), Pets
atendidos, Clientes atendidos, Serviços realizados, Dias de maior
movimento, Horários de maior movimento, Evolução no período, Dados do
funcionário, Histórico de atendimentos (com filtro local de status/
serviço).

**Decisão técnica central**: o servidor faz UMA consulta cobrindo o
período atual + o período anterior (pra comparação) de uma vez só,
filtrada por `id_funcionario` + `id_lojista` + intervalo de datas — nunca
a loja inteira. A partir desse único array (limitado a 1000 linhas, bem
acima do que um funcionário realisticamente atinge num período), TUDO é
calculado em JavaScript: resumo, rankings, evolução, dias/horários de
pico. Isso é o mesmo padrão já usado no Perfil do Cliente — a diferença
aqui é que o conjunto é limitado pelo FILTRO DE PERÍODO (não é "todo o
histórico"), então nunca cresce descontroladamente mesmo pra
funcionários antigos.

**Zero migration, zero RPC nova** — todas as políticas de RLS necessárias
(`funcionario: lojista ve seus funcionarios`, migration 006; e o acesso
do lojista à própria tabela `agendamento`, migration 002) já existiam.

## 3. Como cada métrica foi calculada

| Métrica | Fórmula | Fonte |
|---|---|---|
| Faturamento | `SUM(valor)` onde `status='Concluído'` | mesma regra do Relatório de Vendas |
| Ticket médio | `Faturamento ÷ Atendimentos concluídos` (`"—"` se 0 concluídos) | mesma regra do Relatório de Vendas |
| Atendimentos realizados | `COUNT` onde `status != 'Cancelado'` | agendamentos do funcionário no período |
| Taxa de conclusão | `Concluídos ÷ Total do período` (total inclui cancelados) | — |
| Taxa de cancelamento | `Cancelados ÷ Total do período` | — |
| Pets atendidos (diferentes) | `COUNT(DISTINCT id_pet)` entre os não cancelados | — |
| Dias com atendimento | `COUNT(DISTINCT dt_agendamento)` entre os não cancelados | — |
| Média por dia | `Atendimentos ÷ Dias com atendimento` | — |
| Clientes recorrentes | clientes com mais de 1 atendimento **com este funcionário no período** (não é "recorrente geral" da loja) | — |
| Serviços realizados | agrupado por serviço, só `Concluído`, ordenado por quantidade | mesma base do Relatório de Vendas |
| Dias/horários de maior movimento | agrupado por dia da semana / blocos de 2h, só não cancelados | — |
| Evolução | por dia (períodos ≤31 dias), por semana (≤120 dias) ou por mês (períodos maiores) | dias sem atendimento aparecem como zero só na granularidade "por dia" |
| Comparação com período anterior | mesma fórmula de variação percentual do Relatório de Vendas, "Novo" quando o período anterior for zero | — |

## 4. Arquivos

**Criados:**
- `src/app/lojista/funcionarios/[id]/page.tsx` — Server Component (busca + filtro de período).
- `src/components/lojista/PerfilFuncionarioClient.tsx` — toda a UI e os cálculos.
- `docs/PERFIL_FUNCIONARIO.md` — este documento.

**Modificados:**
- `src/components/lojista/FuncionariosList.tsx` — card clicável, ícone do avatar sem degradê (aproveitando que já estava mexendo no arquivo).
- `src/components/lojista/NovoAgendamentoModal.tsx` — prop opcional `funcionarioIdPadrao` (valor inicial do select de profissional, que já era opcional).
- `src/components/lojista/AgendaCalendar.tsx` / `src/app/lojista/agendamentos/page.tsx` — leem `?novoAgendamentoProfissional=<id>`.

## 5. O que não foi implementado (e por quê)

- **"Clientes novos no período" (funcionário)**: calcular corretamente exigiria cruzar `cliente_lojista.created_at` por cliente, uma consulta extra por cliente — decidi não fazer essa aproximação e mostrar só "clientes atendidos" e "recorrentes com este funcionário", que são calculáveis com uma confiança total a partir do mesmo conjunto já carregado.
- **"Serviços que o funcionário realiza" (como cadastro fixo)**: não existe esse relacionamento no banco (`pode_gerenciar_servicos` é uma permissão de sistema, não uma lista de especialidades) — a seção "Serviços realizados" mostra o que ele efetivamente atendeu no período, que é o dado real disponível.
- **Roles Admin/Atendente/Caixa e "módulo Financeiro" separado**: não existem nesta arquitetura — mesma explicação já documentada em `docs/RELATORIOS_VENDAS.md` e `docs/PERFIL_CLIENTE.md`.

## 6. Multi-tenant e permissões

- `.eq('id_lojista', lojistaId)` explícito em toda consulta, além do RLS
  já existente (`funcionario`: migration 006; `agendamento`: migration
  002) — dupla camada, no backend.
- Funcionário de outra loja: a consulta volta vazia, a tela mostra
  "Funcionário não encontrado" (não revela se ele existe em outra loja).
- Página dentro de `/lojista/*`, já restrita a `role = 'lojista'`.

## 7. Performance

- Uma única consulta cobre período atual + anterior (evita duas idas ao
  banco pra comparação).
- Limitada a 1000 linhas e ao filtro de período — nunca a loja inteira.
- Todas as agregações (resumo, rankings, evolução) são `reduce`/`Map` em
  JS sobre esse único array — zero N+1, zero chamada por seção.

## 8. Testes realizados

`tsc --noEmit`, `eslint` e `next build` completos, sem erros. Fluxo
manual a testar: abrir Funcionários → clicar num card → conferir os 6
presets de período → conferir que os números batem com Agenda/Kanban
pra esse profissional → testar funcionário sem atendimento no período →
Novo Agendamento (profissional pré-selecionado) → Ativar/Desativar.
