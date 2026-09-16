# Relatórios de Vendas — `/lojista/relatorios`

## 0. Como o pedido original foi traduzido pra este projeto

O pedido descreveu a feature em termos genéricos de um SaaS multi-tenant com
Prisma (`company_id`, `store_id`, roles Admin/Atendente/Caixa/Operacional,
`needs_taxidog`, tabela de pagamentos). **Nada disso existe neste projeto.**
Este é um app Next.js + Supabase (Postgres/RLS), sem Prisma, com uma única
camada de tenant (`lojista.id_lojista = auth.uid()`, sem hierarquia
empresa→loja) e só três roles reais: `cliente`, `lojista`, `funcionario`
(este último sem nenhuma tela própria ainda). Tudo abaixo é a versão real,
mapeada pra essa arquitetura — nada foi implementado em cima do vocabulário
genérico do pedido.

## 1. Levantamento feito antes de escrever qualquer código

| Pergunta do pedido | Resposta real encontrada no projeto |
|---|---|
| Como os agendamentos são armazenados? | Tabela `agendamento` (migration 001): `id_pet, id_servico, id_cliente, id_lojista, dt_agendamento, hr_agendamento, valor, status, id_funcionario`. `status` é o enum `status_agendamento`: `Pendente`, `Confirmado`, `Concluído`, `Cancelado`. |
| Como os pagamentos são armazenados? | **Não existem.** Não há tabela de pagamento nem coluna de forma de pagamento em nenhuma migration. `agendamento.valor` é o único valor monetário do sistema. |
| Como o financeiro funciona hoje? | Não existe um módulo "Financeiro" separado. A única definição oficial de receita já existente é `fn_metricas_lojista` (migration 003): `receita_mes = SUM(valor) FILTER (WHERE status = 'Concluído')`. Os Relatórios de Vendas reusam **exatamente** essa definição — venda = atendimento `Concluído`. |
| Como serviços e preços funcionam? | Tabela `servico` (preço base) + `servico_variacao` (migration 010, preço por porte/raça do pet) + `fn_calcular_preco_servico`. O preço final gravado em `agendamento.valor` já vem dessa função — os relatórios não recalculam preço, só leem `valor`. |
| Como clientes e pets se relacionam? | `pet.id_cliente → cliente`. `cliente_lojista` (migration 014) registra "este lojista conhece este cliente" — usada aqui pra "clientes novos no período". |
| Como a "Store" é identificada? | `lojista.id_lojista = auth.uid()`. Toda função nova recebe `p_id_lojista` e valida `auth.uid() = p_id_lojista` internamente (mesmo padrão de toda RPC já existente). |
| Que APIs/services/hooks já existem? | Nenhum client-side data hook — o padrão do projeto é: Server Component busca via Supabase (RPC ou `.from()`), Client Component recebe como prop e usa Server Actions (`'use server'`) pra mutação. Filtros/paginação trafegam pela URL (`searchParams`) e `router.push`, igual `/lojista/kanban` e `/lojista/agendamentos`. Reaproveitado 100%. |
| Que dados dão pra usar nos relatórios? | `agendamento` (valor, status, data, hora, funcionário), `servico` (nome), `funcionario` (nome), `cliente` (nome), `cliente_lojista` (data de vínculo). Nada mais — não existe forma de pagamento nem taxidog em canto nenhum do banco. |

## 2. Definições oficiais reaproveitadas (não duplicadas)

- **Venda / atendimento concluído** = agendamento com `status = 'Concluído'`.
- **Faturamento** = `SUM(valor)` dos agendamentos Concluído no período — igual `fn_metricas_lojista.receita_mes`.
- **Total recebido**: o banco **não distingue** "faturado" de "efetivamente recebido" (não há confirmação de pagamento). Por isso o card mostra **"Faturamento (recebido)"** como um único número — mostrar dois cards idênticos com nomes diferentes pareceria um bug, e inventar uma regra de "recebido ≠ faturado" seria simular dado que não existe.
- **Total pendente** = `SUM(valor)` dos agendamentos `Pendente` + `Confirmado` — esse sim é um número genuinamente diferente (ainda não foi prestado o serviço).
- **Ticket médio** = Faturamento ÷ Vendas (só `Concluído`).
- **Valor médio por atendimento** = soma do valor de **todos** os agendamentos não cancelados ÷ quantidade deles. É deliberadamente diferente do ticket médio (que é só vendas fechadas) — mostra o valor médio de tudo que está na agenda, fechado ou não.

## 3. Dados que o pedido pede mas **não existem** (não simulados)

| Pedido | Por que não existe | Como adicionar no futuro |
|---|---|---|
| Forma de pagamento (Pix/Cartão/Dinheiro/Fiado) | Nenhuma coluna/tabela guarda isso hoje. | Nova coluna `forma_pagamento` em `agendamento` (enum) preenchida na hora de marcar `Concluído`, ou uma tabela `pagamento` separada se um agendamento puder ter mais de uma forma de pagamento (parcelado). |
| Taxidog / `needs_taxidog` | Não existe esse campo em nenhuma tabela do projeto atual. | Se for uma cobrança fixa, o caminho natural é modelar como mais um `servico` (ex.: "Taxidog"), reaproveitando toda a estrutura de preço/relatório que já existe — sem precisar de campo novo. Se for um adicional por agendamento (não um serviço próprio), aí sim precisaria de uma coluna `agendamento.taxidog_valor` ou similar. |

Essas duas seções aparecem no próprio `/lojista/relatorios` (card "Dados ainda não
disponíveis"), não só aqui — pra ser transparente com quem usa o sistema, não só com quem lê este documento.

## 4. Estrutura implementada

### Filtros de período (topo da página)
Hoje, Últimos 7 dias, Últimos 30 dias, Este mês (até hoje), Mês anterior
(completo) e Personalizado (data inicial/final, limitado a 366 dias por
requisição pra proteger a query de agregação por dia). Cálculo em
[`src/lib/relatorios.ts`](../src/lib/relatorios.ts) — puro, sem I/O, com
`calcularPeriodo` e `calcularPeriodoAnterior` (usada na comparação).

### Filtros de profissional / serviço / status
Deliberadamente escopados **só à tabela de Detalhamento**, não aos cards e
quebras (Vendas por Serviço/Profissional já SÃO a visão quebrada por essas
dimensões — filtrar os cards por serviço também seria redundante com a seção
"Vendas por serviço"). Forma de pagamento não existe, então não há filtro
por ela.

### Cards principais
Faturamento (recebido), Vendas, Ticket médio, Atendimentos no período, Valor
médio por atendimento, Total pendente — com comparação percentual real
contra o período anterior de mesma duração (`ComparacaoBadge`), nunca uma
porcentagem inventada (quando o período anterior é zero, mostra "Novo" em
vez de dividir por zero).

### Evolução das vendas
Gráfico de barras em CSS/HTML puro (`GraficoFaturamento`, sem biblioteca —
o projeto não tinha nenhuma lib de charts e o gráfico é simples o
suficiente pra não precisar de uma), com dia de maior e menor faturamento
destacados por baixo do gráfico.

### Vendas por serviço / por profissional / clientes
Cada seção mostra quantidade, faturamento e (serviço) participação
percentual — todos vindos de agregação SQL, não calculados em JS sobre
lista bruta.

### Detalhamento das vendas
Tabela paginada (20 por página) com ordenação (data/valor, asc/desc),
filtros de profissional/serviço/status, estado vazio e loading (`isPending`
via `useTransition`, mesmo padrão do resto do app).

### Exportação CSV
Server Action (`exportarRelatorioVendasCsvAction`) gera o CSV no servidor
(delimitador `;`, decimal com vírgula — padrão Excel BR) respeitando os
mesmos filtros da tabela, limitado a 5000 linhas (acima disso pede pra
estreitar o período). Nenhuma biblioteca nova — `Blob` + `URL.createObjectURL`
já são suficientes.

## 5. Arquivos

**Criados:**
- `supabase/migrations/016_relatorio_vendas.sql` — 6 funções `SECURITY DEFINER`/`STABLE` de agregação (resumo, por dia, por serviço, por profissional, por cliente, resumo de clientes).
- `src/lib/relatorios.ts` — cálculo de período (preset → datas, período anterior, variação percentual).
- `src/app/lojista/relatorios/page.tsx` — Server Component: lê `searchParams`, dispara as 10 consultas em paralelo (`Promise.all`), trata erro de migration ausente.
- `src/components/lojista/RelatorioVendasClient.tsx` — Client Component: filtros, cards, gráfico, quebras, tabela paginada, exportação.

**Modificados:**
- `src/lib/actions.ts` — `exportarRelatorioVendasCsvAction`.
- `src/components/layout/LojistaSidebar.tsx` — item "Relatórios de Vendas" na navegação.
- `src/components/icons/index.tsx` — `IconChartBar`, `IconDownload`, `IconTrendUp`, `IconTrendDown`.
- `src/app/globals.css` — classes `.relatorio-*` (reaproveitando os mesmos tokens de cor/espaçamento/raio já usados em todo o app; nenhuma cor nova).

## 6. Multi-tenant e permissões

- Toda função nova recebe `p_id_lojista` e faz `IF auth.uid() != p_id_lojista THEN RAISE EXCEPTION` — mesmo padrão de `fn_metricas_lojista`, `fn_agenda_dia`, etc.
- A página vive dentro de `/lojista/*`, que já é gateado por `src/app/lojista/layout.tsx` (só `role = 'lojista'`) — nenhum sistema de permissão novo foi criado.
- Não existem hoje roles "Admin/Atendente/Caixa/Operacional" dentro de uma loja — só `lojista` (dono, acesso total) e `funcionario` (tem flags `pode_gerenciar_agenda`/`pode_gerenciar_servicos` no banco, mas nenhuma tela própria ainda). Como este relatório é 100% dentro da área do lojista, ele já é, por construção, exclusivo do dono da loja — não havia necessidade (nem pedido explícito) de abrir acesso parcial pra funcionário nesta etapa.
- RLS de `agendamento`/`servico`/`funcionario`/`cliente` já impedia (antes desta feature) um lojista ler dado de outro — a consulta de detalhamento e o CSV usam o client autenticado normal (não `service_role`), então ficam sob RLS além do filtro explícito `.eq('id_lojista', ...)` — dupla camada, backend, não confia só no filtro do frontend.

## 7. Performance

- Toda soma/contagem/agrupamento roda no Postgres (`SUM`, `COUNT`, `GROUP BY`, `FILTER`) — nenhuma lista de agendamentos crus é carregada pro navegador pra ser somada em JS.
- As 10 consultas do período (resumo atual, resumo anterior, por dia, por serviço, por profissional, por cliente, resumo de clientes, funcionários, serviços, página de detalhamento) disparam juntas num único `Promise.all`, igual o Dashboard já faz.
- Detalhamento paginado no banco (`.range()` + `count: 'exact'`), nunca a lista inteira.
- Período personalizado limitado a 366 dias por requisição (protege o `generate_series` do gráfico por dia).
- Exportação CSV limitada a 5000 linhas por chamada.

## 8. Como testar

1. Rodar a migration 016 no SQL Editor do Supabase.
2. Abrir `/lojista/relatorios` — confirmar que aparece na sidebar entre Kanban e Serviços.
3. Trocar entre os 6 presets de período e conferir que os cards mudam.
4. Escolher "Personalizado" com um range que inclua e não inclua vendas — conferir estado vazio.
5. Conferir que "Faturamento" bate com a soma manual dos agendamentos `Concluído` no período (comparar com a aba Agendamentos).
6. Filtrar a tabela de detalhamento por profissional/serviço/status e conferir que só os cards de cima (não filtrados) continuam mostrando o total do período.
7. Exportar CSV e abrir no Excel/LibreOffice — conferir acentuação e separador decimal.
8. Testar em uma loja sem nenhum funcionário/serviço cadastrado — conferir que as seções correspondentes mostram "Nenhuma venda concluída neste período." em vez de quebrar.
