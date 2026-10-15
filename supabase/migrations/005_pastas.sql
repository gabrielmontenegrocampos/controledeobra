-- ============================================================
--  MIGRACAO 005 - Pastas dos arquivos
--  Rode no SQL Editor do Supabase. E idempotente.
-- ============================================================

-- Uma pasta pode ficar dentro de outra. Apagar a mae apaga as filhas,
-- mas os arquivos nao somem: voltam para a raiz (on delete set null).
create table if not exists pastas (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  pasta_pai_id uuid references pastas(id) on delete cascade,
  ordem        integer not null default 0,
  created_at   timestamptz default now()
);

create index if not exists idx_pastas_pai on pastas(pasta_pai_id);

alter table arquivos
  add column if not exists pasta_id uuid references pastas(id) on delete set null;

create index if not exists idx_arquivos_pasta on arquivos(pasta_id);

alter table pastas enable row level security;
drop policy if exists "acesso_total" on pastas;
create policy "acesso_total" on pastas for all using (true) with check (true);
