-- ============================================================
--  MIGRACAO 001 - Biblioteca de arquivos
--  Rode no SQL Editor do Supabase. E idempotente.
--  (Ja esta incluida no schema.sql; este arquivo serve para
--   quem ja rodou o schema antes e so quer a parte nova.)
-- ============================================================

create table if not exists arquivos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  categoria       text not null default 'outros'
                  check (categoria in ('projeto','contrato','alvara','art_rrt',
                                       'orcamento','memorial','nota','outros')),
  descricao       text,
  url             text not null,
  tipo_arquivo    text,
  tamanho         bigint,
  data_referencia date,
  created_at      timestamptz default now()
);

create index if not exists idx_arquivos_categoria on arquivos(categoria);
create index if not exists idx_arquivos_data on arquivos(created_at desc);

alter table arquivos enable row level security;
drop policy if exists "acesso_total" on arquivos;
create policy "acesso_total" on arquivos for all using (true) with check (true);

-- resumo por categoria, usado nos cartoes da tela
create or replace view v_arquivos_resumo as
select
  categoria,
  count(*)                        as quantidade,
  coalesce(sum(tamanho), 0)       as tamanho_total,
  max(created_at)                 as ultimo_envio
from arquivos
group by categoria;
