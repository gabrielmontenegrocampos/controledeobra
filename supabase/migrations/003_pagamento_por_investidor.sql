-- ============================================================
--  MIGRACAO 003 - Quem pagou cada conta
--  Cada lancamento passa a registrar o investidor que pagou.
--  Rode no SQL Editor do Supabase. E idempotente.
-- ============================================================

alter table lancamentos
  add column if not exists investidor_id uuid references investidores(id) on delete set null;

create index if not exists idx_lanc_investidor on lancamentos(investidor_id);

-- ------------------------------------------------------------
--  Caixa: o que cada um colocou na obra
--
--  total_investido = aportes em dinheiro + contas pagas direto
--  saldo           = aportes - contas pagas com o dinheiro do caixa
--                    (quem paga a conta direto nao mexe no caixa comum)
-- ------------------------------------------------------------
drop view if exists v_caixa_resumo;
create view v_caixa_resumo as
select
  (select coalesce(sum(valor), 0) from aportes) as total_aportado,
  (select coalesce(sum(valor), 0) from lancamentos where status = 'pago') as total_pago,
  (select coalesce(sum(valor), 0) from lancamentos where status = 'a_pagar') as total_a_pagar,
  (select coalesce(sum(valor), 0) from aportes)
    - (select coalesce(sum(valor), 0) from lancamentos
       where status = 'pago' and investidor_id is null) as saldo,
  (select coalesce(sum(valor), 0) from lancamentos
   where status = 'pago' and investidor_id is not null) as pago_investidores,
  (select coalesce(sum(valor), 0) from lancamentos
   where status = 'pago' and investidor_id is null) as pago_sem_investidor,
  (select coalesce(sum(valor), 0) from aportes)
    + (select coalesce(sum(valor), 0) from lancamentos
       where status = 'pago' and investidor_id is not null) as total_investido;

drop view if exists v_investidores_resumo;
create view v_investidores_resumo as
with contas as (
  select investidor_id,
         sum(valor) as total,
         count(*)   as qtd,
         max(coalesce(data_pagamento, data_emissao)) as ultima
  from lancamentos
  where status = 'pago' and investidor_id is not null
  group by investidor_id
),
ap as (
  select investidor_id,
         sum(valor) as total,
         count(*)   as qtd,
         max(data)  as ultima
  from aportes
  group by investidor_id
),
geral as (
  select (select coalesce(sum(valor), 0) from aportes)
       + (select coalesce(sum(valor), 0) from lancamentos
          where status = 'pago' and investidor_id is not null) as total
)
select
  i.id,
  i.nome,
  coalesce(ap.total, 0) as total_aportado,
  coalesce(ap.qtd, 0)   as qtd_aportes,
  ap.ultima             as ultimo_aporte,
  case when (select total from geral) > 0
       then round((coalesce(ap.total, 0) + coalesce(c.total, 0))
                  / (select total from geral) * 100, 2)
       else 0 end       as perc_participacao,
  coalesce(c.total, 0)  as total_pago_contas,
  coalesce(c.qtd, 0)    as qtd_contas,
  coalesce(ap.total, 0) + coalesce(c.total, 0) as total_geral
from investidores i
left join ap    on ap.investidor_id = i.id
left join contas c on c.investidor_id = i.id;
