# Controle de Obra — Lagoa Santa

App simples para controlar os custos da obra das 2 casas geminadas em Lagoa Santa/MG:
previsto × realizado, diário de obra, notas fiscais com comprovante e caixa dos investidores.

**Stack:** Next.js 16 · React 19 · Tailwind 4 · Supabase (Postgres + Storage) · Vercel

## Seções

| Página | Para que serve |
|---|---|
| **Dashboard** (`/`) | Previsto × realizado, avanço físico × financeiro, custo por casa, gasto mensal, alertas |
| **Orçamento** (`/orcamento`) | Etapas da obra: valor previsto e % de avanço (edição direto na tabela) |
| **Lançamentos** (`/lancamentos`) | NF de material, mão de obra, serviços e taxas — com itens da nota, NF e comprovante anexados. Importa o **XML da NF-e** e preenche tudo sozinho |
| **Fornecedores** (`/fornecedores`) | Lista que se completa sozinha a cada lançamento, com CNPJ, contato e total comprado de cada um |
| **Materiais** (`/materiais`) | Consolidado por material: quantidade comprada, preço médio e histórico de compras |
| **Caixa** (`/caixa`) | Quanto cada investidor colocou: contas que ele mesmo pagou + aportes em dinheiro, com participação de cada um |
| **Diário** (`/diario`) | Registro diário: clima, atividades, equipe, ocorrências e fotos |
| **Arquivos** (`/arquivos`) | Biblioteca de projetos, contratos, alvarás, ARTs e memoriais, com categoria e busca |

Toda seção exporta **PDF** e **Excel**.

## Como a conta fecha

- **Lançamento** = dinheiro que sai, sempre ligado a uma etapa e a uma casa (Casa 01, Casa 02 ou Comum),
  e com o investidor que pagou aquela conta.
- **Aporte** = dinheiro entregue ao caixa comum, sem ser para uma conta específica.
- **Compra parcelada** = entrada + N parcelas mensais; cada parcela é um lançamento a pagar com vencimento.
- Total investido por sócio = contas que ele pagou + aportes dele.
- Saldo do caixa comum = aportes − contas pagas sem investidor definido.
- Realizado por etapa = soma dos lançamentos daquela etapa.
- Custo por casa = lançamentos da casa + metade dos lançamentos comuns.

## Configuração

### 1. Banco de dados

No painel do Supabase → **SQL Editor** → cole o conteúdo de
[`supabase/schema.sql`](supabase/schema.sql) e rode.

Isso cria as tabelas, as views do dashboard, as policies, o bucket `anexos`
(para NF, comprovantes, fotos e a biblioteca de arquivos) e as 15 etapas iniciais.

Se o banco já tinha sido criado antes, rode só as migrações novas que estão em
[`supabase/migrations/`](supabase/migrations) — ou o `schema.sql` inteiro de novo,
que é idempotente e não apaga nada.

### 2. Variáveis de ambiente

Crie um arquivo `.env.local` na raiz (veja `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

As duas chaves estão em Supabase → Settings → API.
Na Vercel, cadastre as mesmas duas variáveis em Settings → Environment Variables.

### 3. Rodar local

```bash
npm install
npm run dev
```

## Atenção: app sem login

O app foi feito sem autenticação — **quem tiver o link pode ver e editar** os dados
financeiros. As policies do Postgres liberam acesso para a chave `anon`.

Para fechar o acesso depois, as opções são, da mais simples para a mais completa:

1. Tela de PIN único guardado em variável de ambiente;
2. Supabase Auth com login por e-mail e policies usando `auth.uid()`;
3. Login por pessoa com papéis (admin lança, investidor só visualiza).
