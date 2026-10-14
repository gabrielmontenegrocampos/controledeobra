-- ============================================================
--  MIGRACAO 002 - Subetapas
--  Rode no SQL Editor do Supabase. E idempotente.
--  (Ja esta incluida no schema.sql.)
-- ============================================================

-- Uma etapa pode ser filha de outra. Apagar a mae apaga as filhas.
alter table etapas
  add column if not exists etapa_pai_id uuid references etapas(id) on delete cascade;

create index if not exists idx_etapas_pai on etapas(etapa_pai_id);

-- a coluna nova entra no fim da view (exigencia do create or replace)
create or replace view v_etapas_resumo as
select
  e.id,
  e.nome,
  e.grupo,
  e.ordem,
  e.perc_avanco,
  e.valor_previsto,
  coalesce(l.realizado, 0) as realizado,
  coalesce(l.pago, 0)      as pago,
  coalesce(l.a_pagar, 0)   as a_pagar,
  e.valor_previsto - coalesce(l.realizado, 0) as saldo,
  case when e.valor_previsto > 0
       then round(coalesce(l.realizado, 0) / e.valor_previsto * 100, 2)
       else null end as perc_financeiro,
  e.etapa_pai_id
from etapas e
left join (
  select etapa_id,
         sum(valor) as realizado,
         sum(case when status = 'pago'    then valor else 0 end) as pago,
         sum(case when status = 'a_pagar' then valor else 0 end) as a_pagar
  from lancamentos
  group by etapa_id
) l on l.etapa_id = e.id;
