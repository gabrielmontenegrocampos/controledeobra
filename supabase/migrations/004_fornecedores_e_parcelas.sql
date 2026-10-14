-- ============================================================
--  MIGRACAO 004 - Fornecedores e compras parceladas
--  Rode no SQL Editor do Supabase. E idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. FORNECEDORES
--    A lista se alimenta sozinha: todo lancamento novo cadastra
--    o fornecedor que ainda nao existe (com CNPJ, quando vem do XML).
-- ------------------------------------------------------------
create table if not exists fornecedores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  cnpj       text,
  telefone   text,
  email      text,
  observacao text,
  created_at timestamptz default now()
);

create unique index if not exists idx_fornecedores_nome on fornecedores (lower(btrim(nome)));
create unique index if not exists idx_fornecedores_cnpj on fornecedores (cnpj) where cnpj is not null;

-- ------------------------------------------------------------
-- 2. COMPRAS PARCELADAS (o lote, por exemplo)
--    O parcelamento e so o cabecalho: cada parcela vira um
--    lancamento normal, entao entra no orcamento, no caixa e
--    nos relatorios como qualquer outra conta.
-- ------------------------------------------------------------
create table if not exists parcelamentos (
  id               uuid primary key default gen_random_uuid(),
  descricao        text not null,
  fornecedor       text,
  fornecedor_id    uuid references fornecedores(id) on delete set null,
  etapa_id         uuid references etapas(id) on delete set null,
  casa             text not null default 'comum'
                   check (casa in ('casa_01','casa_02','comum')),
  tipo             text not null default 'outro'
                   check (tipo in ('material','mao_de_obra','servico','taxa','outro')),
  valor_total      numeric(14,2) not null default 0,
  valor_entrada    numeric(14,2) not null default 0,
  qtd_parcelas     integer not null default 1,
  valor_parcela    numeric(14,2) not null default 0,
  primeira_parcela date not null,
  observacao       text,
  created_at       timestamptz default now()
);

-- ------------------------------------------------------------
-- 3. COLUNAS NOVAS EM LANCAMENTOS
-- ------------------------------------------------------------
alter table lancamentos
  add column if not exists fornecedor_id   uuid references fornecedores(id) on delete set null,
  add column if not exists parcelamento_id uuid references parcelamentos(id) on delete cascade,
  add column if not exists parcela_num     integer,
  add column if not exists parcela_total   integer,
  add column if not exists data_vencimento date;

create index if not exists idx_lanc_fornecedor   on lancamentos(fornecedor_id);
create index if not exists idx_lanc_parcelamento on lancamentos(parcelamento_id);
create index if not exists idx_lanc_vencimento   on lancamentos(data_vencimento);

-- as contas antigas passam a ter vencimento igual a data da nota
update lancamentos set data_vencimento = data_emissao where data_vencimento is null;

-- ------------------------------------------------------------
-- 4. RLS DAS TABELAS NOVAS
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array['fornecedores','parcelamentos'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "acesso_total" on %I', t);
    execute format('create policy "acesso_total" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. VIEWS
-- ------------------------------------------------------------
drop view if exists v_fornecedores_resumo;
create view v_fornecedores_resumo as
select
  f.id,
  f.nome,
  f.cnpj,
  f.telefone,
  f.email,
  count(l.id)                                   as qtd_lancamentos,
  coalesce(sum(l.valor), 0)                     as total_comprado,
  coalesce(sum(case when l.status = 'a_pagar' then l.valor else 0 end), 0) as total_a_pagar,
  max(l.data_emissao)                           as ultima_compra
from fornecedores f
left join lancamentos l on l.fornecedor_id = f.id
group by f.id, f.nome, f.cnpj, f.telefone, f.email;

drop view if exists v_parcelamentos_resumo;
create view v_parcelamentos_resumo as
select
  p.id,
  p.descricao,
  p.fornecedor,
  p.valor_total,
  p.valor_entrada,
  p.qtd_parcelas,
  p.valor_parcela,
  p.primeira_parcela,
  p.casa,
  p.etapa_id,
  count(l.id) filter (where l.parcela_num is not null)                      as parcelas_geradas,
  count(l.id) filter (where l.parcela_num is not null and l.status = 'pago') as parcelas_pagas,
  coalesce(sum(l.valor) filter (where l.status = 'pago'), 0)                as valor_pago,
  coalesce(sum(l.valor) filter (where l.status = 'a_pagar'), 0)             as valor_em_aberto,
  min(l.data_vencimento) filter (where l.status = 'a_pagar')                as proximo_vencimento
from parcelamentos p
left join lancamentos l on l.parcelamento_id = p.id
group by p.id;
