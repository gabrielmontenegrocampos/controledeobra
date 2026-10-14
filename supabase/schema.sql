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
  created_at       timestamptz default now()
);

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

-- Caixa: entradas, saidas e saldo
create or replace view v_caixa_resumo as
select
  (select coalesce(sum(valor), 0) from aportes) as total_aportado,
  (select coalesce(sum(valor), 0) from lancamentos where status = 'pago') as total_pago,
  (select coalesce(sum(valor), 0) from lancamentos where status = 'a_pagar') as total_a_pagar,
  (select coalesce(sum(valor), 0) from aportes)
    - (select coalesce(sum(valor), 0) from lancamentos where status = 'pago') as saldo;

-- Quanto cada investidor aportou e sua participacao
create or replace view v_investidores_resumo as
select
  i.id,
  i.nome,
  coalesce(sum(a.valor), 0) as total_aportado,
  count(a.id)               as qtd_aportes,
  max(a.data)               as ultimo_aporte,
  case when (select sum(valor) from aportes) > 0
       then round(coalesce(sum(a.valor), 0) / (select sum(valor) from aportes) * 100, 2)
       else 0 end as perc_participacao
from investidores i
left join aportes a on a.investidor_id = i.id
group by i.id, i.nome;

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
                        'ocorrencias','arquivos'])
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
