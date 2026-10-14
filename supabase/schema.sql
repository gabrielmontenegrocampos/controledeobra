-- ============================================================
--  CONTROLE DE OBRA - LAGOA SANTA
--  Cole este arquivo inteiro no SQL Editor do Supabase e rode.
--  Pode rodar mais de uma vez: e idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELAS
-- ------------------------------------------------------------

-- Dados da obra (uma linha so)
create table if not exists obra (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null default 'Obra Lagoa Santa',
  endereco          text,
  area_m2           numeric(10,2),
  data_inicio       date,
  data_previsao_fim date,
  observacao        text,
  created_at        timestamptz default now()
);

-- Etapas do orcamento = linha-base do PREVISTO + avanco fisico
create table if not exists etapas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  grupo          text,
  valor_previsto numeric(14,2) not null default 0,
  perc_avanco    numeric(5,2)  not null default 0 check (perc_avanco >= 0 and perc_avanco <= 100),
  ordem          integer not null default 0,
  created_at     timestamptz default now()
);

-- subetapas: uma etapa pode ser filha de outra (apagar a mae apaga as filhas)
alter table etapas
  add column if not exists etapa_pai_id uuid references etapas(id) on delete cascade;

create index if not exists idx_etapas_pai on etapas(etapa_pai_id);

-- Investidores
create table if not exists investidores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  observacao text,
  created_at timestamptz default now()
);

-- Aportes = dinheiro que ENTRA no caixa
create table if not exists aportes (
  id              uuid primary key default gen_random_uuid(),
  investidor_id   uuid references investidores(id) on delete restrict not null,
  data            date not null default current_date,
  valor           numeric(14,2) not null check (valor > 0),
  forma           text,
  observacao      text,
  comprovante_url text,
  created_at      timestamptz default now()
);

-- Fornecedores: a lista se alimenta sozinha a cada lancamento novo
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

-- Compras parceladas (o lote, por exemplo). Cada parcela vira um
-- lancamento normal, entao entra no orcamento e nos relatorios.
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

-- Lancamentos = dinheiro que SAI (1 nota fiscal ou 1 pagamento)
create table if not exists lancamentos (
  id               uuid primary key default gen_random_uuid(),
  etapa_id         uuid references etapas(id) on delete set null,
  tipo             text not null default 'material'
                   check (tipo in ('material','mao_de_obra','servico','taxa','outro')),
  casa             text not null default 'comum'
                   check (casa in ('casa_01','casa_02','comum')),
  fornecedor       text,
  descricao        text,
  nf_numero        text,
  data_emissao     date not null default current_date,
  data_pagamento   date,
  valor            numeric(14,2) not null default 0,
  status           text not null default 'pago' check (status in ('pago','a_pagar')),
  forma_pagamento  text,
  nf_url           text,
  comprovante_url  text,
  investidor_id    uuid references investidores(id) on delete set null,
  fornecedor_id    uuid references fornecedores(id) on delete set null,
  parcelamento_id  uuid references parcelamentos(id) on delete cascade,
  parcela_num      integer,
  parcela_total    integer,
  data_vencimento  date,
  created_at       timestamptz default now()
);

-- quem pagou a conta (para bancos criados antes desta coluna existir)
alter table lancamentos
  add column if not exists investidor_id uuid references investidores(id) on delete set null;

create index if not exists idx_lanc_investidor on lancamentos(investidor_id);

-- fornecedor, parcela e vencimento (para bancos criados antes destas colunas)
alter table lancamentos
  add column if not exists fornecedor_id   uuid references fornecedores(id) on delete set null,
  add column if not exists parcelamento_id uuid references parcelamentos(id) on delete cascade,
  add column if not exists parcela_num     integer,
  add column if not exists parcela_total   integer,
  add column if not exists data_vencimento date;

create index if not exists idx_lanc_fornecedor   on lancamentos(fornecedor_id);
create index if not exists idx_lanc_parcelamento on lancamentos(parcelamento_id);
create index if not exists idx_lanc_vencimento   on lancamentos(data_vencimento);

update lancamentos set data_vencimento = data_emissao where data_vencimento is null;

-- Itens da nota: da a ENTRADA e a QUANTIDADE de cada material
create table if not exists itens_lancamento (
  id            uuid primary key default gen_random_uuid(),
  lancamento_id uuid references lancamentos(id) on delete cascade not null,
  material      text not null,
  unidade       text,
  quantidade    numeric(14,3) not null default 1,
  valor_unit    numeric(14,4) not null default 0,
  created_at    timestamptz default now()
);

-- ---------- DIARIO DE OBRA ----------
create table if not exists registros (
  id          uuid primary key default gen_random_uuid(),
  data        date not null unique,
  descricao   text,
  clima       text check (clima in ('sol','nublado','chuva','tempestade','ventoso')),
  temperatura integer,
  created_at  timestamptz default now()
);

create table if not exists fotos (
  id          uuid primary key default gen_random_uuid(),
  registro_id uuid references registros(id) on delete cascade not null,
  url         text not null,
  legenda     text,
  created_at  timestamptz default now()
);

create table if not exists equipe_dia (
  id          uuid primary key default gen_random_uuid(),
  registro_id uuid references registros(id) on delete cascade not null,
  nome        text not null,
  funcao      text,
  horas       numeric(4,1)
);

create table if not exists ocorrencias (
  id          uuid primary key default gen_random_uuid(),
  registro_id uuid references registros(id) on delete cascade not null,
  descricao   text not null,
  tipo        text default 'observacao' check (tipo in ('problema','desvio','observacao')),
  severidade  text default 'baixa' check (severidade in ('baixa','media','alta'))
);

-- ---------- BIBLIOTECA DE ARQUIVOS ----------
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
create index if not exists idx_lanc_etapa  on lancamentos(etapa_id);
create index if not exists idx_lanc_data   on lancamentos(data_emissao desc);
create index if not exists idx_itens_lanc  on itens_lancamento(lancamento_id);
create index if not exists idx_aportes_inv on aportes(investidor_id);
create index if not exists idx_fotos_reg   on fotos(registro_id);
create index if not exists idx_equipe_reg  on equipe_dia(registro_id);
create index if not exists idx_ocorr_reg   on ocorrencias(registro_id);

-- ------------------------------------------------------------
-- 2. VIEWS (o dashboard e os relatorios leem daqui)
-- ------------------------------------------------------------

-- Previsto x realizado por etapa
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

-- Caixa: quanto cada um colocou na obra
--   total_investido = aportes em dinheiro + contas pagas direto pelo investidor
--   saldo           = aportes - contas pagas com o dinheiro do caixa comum
create or replace view v_caixa_resumo as
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

-- Quanto cada investidor colocou: aportes + contas que ele mesmo pagou
create or replace view v_investidores_resumo as
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
left join ap      on ap.investidor_id = i.id
left join contas c on c.investidor_id = i.id;

-- Consolidado de materiais comprados
create or replace view v_materiais_resumo as
select
  min(i.material)                  as material,
  lower(btrim(i.material))         as chave,
  coalesce(i.unidade, '-')         as unidade,
  sum(i.quantidade)                as qtd_total,
  sum(i.quantidade * i.valor_unit) as valor_total,
  case when sum(i.quantidade) > 0
       then sum(i.quantidade * i.valor_unit) / sum(i.quantidade)
       else 0 end                  as preco_medio,
  min(i.valor_unit)                as menor_preco,
  max(i.valor_unit)                as maior_preco,
  count(distinct i.lancamento_id)  as qtd_compras,
  max(l.data_emissao)              as ultima_compra
from itens_lancamento i
join lancamentos l on l.id = i.lancamento_id
group by lower(btrim(i.material)), coalesce(i.unidade, '-');

-- Custo por casa (comuns rateados 50/50)
create or replace view v_casas_resumo as
select
  coalesce(sum(case when casa = 'casa_01' then valor else 0 end), 0)
    + coalesce(sum(case when casa = 'comum' then valor / 2 else 0 end), 0) as custo_casa_01,
  coalesce(sum(case when casa = 'casa_02' then valor else 0 end), 0)
    + coalesce(sum(case when casa = 'comum' then valor / 2 else 0 end), 0) as custo_casa_02,
  coalesce(sum(case when casa = 'comum' then valor else 0 end), 0) as custo_comum,
  coalesce(sum(valor), 0) as custo_total
from lancamentos;

-- Biblioteca: resumo por categoria
create or replace view v_arquivos_resumo as
select
  categoria,
  count(*)                  as quantidade,
  coalesce(sum(tamanho), 0) as tamanho_total,
  max(created_at)           as ultimo_envio
from arquivos
group by categoria;

-- Fornecedores: quanto ja se comprou de cada um
create or replace view v_fornecedores_resumo as
select
  f.id,
  f.nome,
  f.cnpj,
  f.telefone,
  f.email,
  count(l.id)               as qtd_lancamentos,
  coalesce(sum(l.valor), 0) as total_comprado,
  coalesce(sum(case when l.status = 'a_pagar' then l.valor else 0 end), 0) as total_a_pagar,
  max(l.data_emissao)       as ultima_compra
from fornecedores f
left join lancamentos l on l.fornecedor_id = f.id
group by f.id, f.nome, f.cnpj, f.telefone, f.email;

-- Parcelamentos: quanto ja foi pago e qual a proxima parcela
create or replace view v_parcelamentos_resumo as
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
  count(l.id) filter (where l.parcela_num is not null)                       as parcelas_geradas,
  count(l.id) filter (where l.parcela_num is not null and l.status = 'pago') as parcelas_pagas,
  coalesce(sum(l.valor) filter (where l.status = 'pago'), 0)                 as valor_pago,
  coalesce(sum(l.valor) filter (where l.status = 'a_pagar'), 0)              as valor_em_aberto,
  min(l.data_vencimento) filter (where l.status = 'a_pagar')                 as proximo_vencimento
from parcelamentos p
left join lancamentos l on l.parcelamento_id = p.id
group by p.id;

-- Gasto por mes (curva da obra)
create or replace view v_gasto_mensal as
select
  to_char(date_trunc('month', data_emissao), 'YYYY-MM') as mes,
  sum(valor) as total,
  sum(case when tipo = 'material'    then valor else 0 end) as materiais,
  sum(case when tipo = 'mao_de_obra' then valor else 0 end) as mao_de_obra,
  sum(case when tipo not in ('material','mao_de_obra') then valor else 0 end) as outros
from lancamentos
group by date_trunc('month', data_emissao)
order by 1;

-- ------------------------------------------------------------
-- 3. RLS - app sem login: acesso liberado para a chave anon
--    (trocar por policies com auth.uid() se um dia tiver login)
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select unnest(array['obra','etapas','investidores','aportes','lancamentos',
                        'itens_lancamento','registros','fotos','equipe_dia',
                        'ocorrencias','arquivos','fornecedores','parcelamentos'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "acesso_total" on %I', t);
    execute format('create policy "acesso_total" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. STORAGE - bucket publico para NF, comprovantes e fotos
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', true)
on conflict (id) do update set public = true;

drop policy if exists "anexos_leitura"  on storage.objects;
drop policy if exists "anexos_envio"    on storage.objects;
drop policy if exists "anexos_exclusao" on storage.objects;

create policy "anexos_leitura"  on storage.objects for select using (bucket_id = 'anexos');
create policy "anexos_envio"    on storage.objects for insert with check (bucket_id = 'anexos');
create policy "anexos_exclusao" on storage.objects for delete using (bucket_id = 'anexos');

-- ------------------------------------------------------------
-- 5. DADOS INICIAIS
-- ------------------------------------------------------------
insert into obra (nome, endereco, area_m2)
select 'Obra Lagoa Santa', 'Rua Sabiá, 130 e 132 — Vila dos Ypês — Lagoa Santa/MG', 246.16
where not exists (select 1 from obra);

insert into etapas (nome, grupo, ordem)
select v.nome, v.grupo, v.ordem from (values
  ('Serviços preliminares',        'Preliminares',  10),
  ('Fundação',                     'Estrutura',     20),
  ('Estrutura',                    'Estrutura',     30),
  ('Alvenaria',                    'Vedação',       40),
  ('Cobertura',                    'Vedação',       50),
  ('Instalações elétricas',        'Instalações',   60),
  ('Instalações hidrossanitárias', 'Instalações',   70),
  ('Revestimentos',                'Acabamento',    80),
  ('Pisos',                        'Acabamento',    90),
  ('Esquadrias',                   'Acabamento',   100),
  ('Pintura',                      'Acabamento',   110),
  ('Louças e metais',              'Acabamento',   120),
  ('Limpeza e entrega',            'Entrega',      130),
  ('Mão de obra',                  'Mão de obra',  140),
  ('Taxas e documentação',         'Taxas',        150)
) as v(nome, grupo, ordem)
where not exists (select 1 from etapas);
