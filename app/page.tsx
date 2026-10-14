'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Home,
  CalendarDays,
  Receipt,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { brl, dataBR, mesBR, num, pct, LABEL_CASA, LABEL_TIPO } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import type {
  CaixaResumo,
  CasasResumo,
  EtapaResumo,
  GastoMensal,
  Lancamento,
  Obra,
  Registro,
} from '@/lib/types'
import {
  AvisoConfig,
  Badge,
  Barra,
  BotoesRelatorio,
  Card,
  Carregando,
  Erro,
  Stat,
  TituloSecao,
} from '@/components/ui'

export default function DashboardPage() {
  const [obra, setObra] = useState<Obra | null>(null)
  const [etapas, setEtapas] = useState<EtapaResumo[]>([])
  const [caixa, setCaixa] = useState<CaixaResumo | null>(null)
  const [casas, setCasas] = useState<CasasResumo | null>(null)
  const [meses, setMeses] = useState<GastoMensal[]>([])
  const [ultimos, setUltimos] = useState<Lancamento[]>([])
  const [semComprovante, setSemComprovante] = useState(0)
  const [ultimoDiario, setUltimoDiario] = useState<Registro | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [o, e, c, ca, m, u, sc, d] = await Promise.all([
      supabase.from('obra').select('*').limit(1).maybeSingle(),
      supabase.from('v_etapas_resumo').select('*').order('ordem'),
      supabase.from('v_caixa_resumo').select('*').maybeSingle(),
      supabase.from('v_casas_resumo').select('*').maybeSingle(),
      supabase.from('v_gasto_mensal').select('*'),
      supabase
        .from('lancamentos')
        .select('*, etapas(nome)')
        .order('data_emissao', { ascending: false })
        .limit(6),
      supabase
        .from('lancamentos')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pago')
        .is('comprovante_url', null),
      supabase.from('registros').select('*, equipe_dia(*)').order('data', { ascending: false }).limit(1),
    ])

    if (e.error) setErro(e.error.message)
    if (o.data) setObra(o.data as Obra)
    if (e.data) setEtapas(e.data as EtapaResumo[])
    if (c.data) setCaixa(c.data as CaixaResumo)
    if (ca.data) setCasas(ca.data as CasasResumo)
    if (m.data) setMeses(m.data as GastoMensal[])
    if (u.data) setUltimos(u.data as Lancamento[])
    setSemComprovante(sc.count || 0)
    if (d.data && d.data.length) setUltimoDiario(d.data[0] as Registro)
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const previsto = etapas.reduce((s, e) => s + Number(e.valor_previsto), 0)
  const realizado = etapas.reduce((s, e) => s + Number(e.realizado), 0)
  const aPagar = Number(caixa?.total_a_pagar || 0)
  const saldo = Number(caixa?.saldo || 0)
  const avancoFisico =
    previsto > 0
      ? etapas.reduce((s, e) => s + Number(e.perc_avanco) * Number(e.valor_previsto), 0) / previsto
      : 0
  const avancoFinanceiro = previsto > 0 ? (realizado / previsto) * 100 : 0
  const estouradas = etapas.filter(
    (e) => Number(e.valor_previsto) > 0 && Number(e.realizado) > Number(e.valor_previsto)
  )
  const maxMes = Math.max(1, ...meses.map((m) => Number(m.total)))
  const comPrevisto = etapas.filter((e) => Number(e.valor_previsto) > 0 || Number(e.realizado) > 0)

  // ---------- relatorio executivo ----------
  const colunas = ['Etapa', 'Previsto', 'Realizado', 'Saldo', '% Financeiro', '% Avanço']
  const linhas = etapas.map((e) => [
    e.nome,
    brl(e.valor_previsto),
    brl(e.realizado),
    brl(e.saldo),
    e.perc_financeiro != null ? pct(e.perc_financeiro) : '—',
    pct(e.perc_avanco),
  ])

  function gerarPDF() {
    exportarPDF({
      titulo: 'Resumo Executivo da Obra',
      subtitulo: obra?.endereco || undefined,
      colunas,
      linhas,
      resumo: [
        { rotulo: 'Previsto', valor: brl(previsto) },
        { rotulo: 'Realizado', valor: brl(realizado) },
        { rotulo: 'Saldo em caixa', valor: brl(saldo) },
        { rotulo: 'A pagar', valor: brl(aPagar) },
        { rotulo: 'Avanço físico', valor: pct(avancoFisico) },
        { rotulo: 'Avanço financeiro', valor: pct(avancoFinanceiro) },
        { rotulo: 'Custo Casa 01', valor: brl(casas?.custo_casa_01) },
        { rotulo: 'Custo Casa 02', valor: brl(casas?.custo_casa_02) },
      ],
      alinharDireita: [1, 2, 3, 4, 5],
      paisagem: true,
      arquivo: 'resumo-executivo',
    })
  }

  function gerarXLSX() {
    exportarXLSX('resumo-executivo', [
      { nome: 'Etapas', colunas, linhas },
      {
        nome: 'Gasto mensal',
        colunas: ['Mês', 'Total', 'Materiais', 'Mão de obra', 'Outros'],
        linhas: meses.map((m) => [
          m.mes,
          Number(m.total),
          Number(m.materiais),
          Number(m.mao_de_obra),
          Number(m.outros),
        ]),
      },
      {
        nome: 'Resumo',
        colunas: ['Indicador', 'Valor'],
        linhas: [
          ['Previsto', previsto],
          ['Realizado', realizado],
          ['Total aportado', Number(caixa?.total_aportado || 0)],
          ['Total pago', Number(caixa?.total_pago || 0)],
          ['A pagar', aPagar],
          ['Saldo em caixa', saldo],
          ['Avanço físico (%)', Number(avancoFisico.toFixed(2))],
          ['Avanço financeiro (%)', Number(avancoFinanceiro.toFixed(2))],
          ['Custo Casa 01', Number(casas?.custo_casa_01 || 0)],
          ['Custo Casa 02', Number(casas?.custo_casa_02 || 0)],
        ],
      },
    ])
  }

  if (carregando) {
    return (
      <>
        <AvisoConfig />
        <Carregando />
      </>
    )
  }

  return (
    <>
      <TituloSecao titulo={obra?.nome || 'Obra Lagoa Santa'} descricao={obra?.endereco || undefined}>
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      {/* indicadores principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat rotulo="Orçamento previsto" valor={brl(previsto)} tom="destaque" />
        <Stat
          rotulo="Gasto realizado"
          valor={brl(realizado)}
          detalhe={previsto > 0 ? `${pct(avancoFinanceiro)} do previsto` : 'defina o previsto no Orçamento'}
        />
        <Stat
          rotulo="Saldo em caixa"
          valor={brl(saldo)}
          tom={saldo < 0 ? 'negativo' : 'positivo'}
          detalhe={`Aportado: ${brl(caixa?.total_aportado)}`}
        />
        <Stat
          rotulo="A pagar"
          valor={brl(aPagar)}
          tom={aPagar > saldo && aPagar > 0 ? 'negativo' : 'neutro'}
          detalhe={aPagar > saldo && aPagar > 0 ? 'acima do saldo disponível' : undefined}
        />
      </div>

      {/* alertas */}
      {(estouradas.length > 0 || semComprovante > 0 || saldo < 0) && (
        <Card className="mt-4 border-amber-200 bg-amber-50">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> Pontos de atenção
          </p>
          <ul className="space-y-1 text-sm text-amber-900">
            {saldo < 0 && <li>• O caixa está negativo em {brl(Math.abs(saldo))}.</li>}
            {estouradas.length > 0 && (
              <li>
                • {estouradas.length} etapa(s) acima do previsto:{' '}
                {estouradas.slice(0, 3).map((e) => e.nome).join(', ')}
                {estouradas.length > 3 ? '...' : ''}
              </li>
            )}
            {semComprovante > 0 && (
              <li>
                • {semComprovante} pagamento(s) marcados como pagos sem comprovante anexado.{' '}
                <Link href="/lancamentos" className="underline">ver lançamentos</Link>
              </li>
            )}
          </ul>
        </Card>
      )}

      {/* avanco */}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Card>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <TrendingUp className="h-4 w-4 text-[#1f3a5f]" /> Avanço da obra
          </p>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs text-gray-600">
                <span>Físico (execução)</span>
                <span className="tnum font-semibold">{pct(avancoFisico)}</span>
              </div>
              <Barra valor={avancoFisico} max={100} cor="#1f3a5f" />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-gray-600">
                <span>Financeiro (gasto)</span>
                <span className="tnum font-semibold">{pct(avancoFinanceiro)}</span>
              </div>
              <Barra valor={avancoFinanceiro} max={100} cor="#b8893b" />
            </div>
            <p className="pt-1 text-xs text-gray-500">
              {avancoFinanceiro > avancoFisico + 5
                ? 'O dinheiro está saindo mais rápido que a execução.'
                : avancoFisico > avancoFinanceiro + 5
                  ? 'A execução está à frente do gasto — bom sinal.'
                  : 'Execução e gasto andando juntos.'}
            </p>
          </div>
        </Card>

        <Card>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Home className="h-4 w-4 text-[#1f3a5f]" /> Custo por casa
          </p>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs text-gray-600">
                <span>Casa 01</span>
                <span className="tnum font-semibold">{brl(casas?.custo_casa_01)}</span>
              </div>
              <Barra
                valor={Number(casas?.custo_casa_01 || 0)}
                max={Math.max(Number(casas?.custo_casa_01 || 0), Number(casas?.custo_casa_02 || 0), 1)}
              />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-gray-600">
                <span>Casa 02</span>
                <span className="tnum font-semibold">{brl(casas?.custo_casa_02)}</span>
              </div>
              <Barra
                valor={Number(casas?.custo_casa_02 || 0)}
                max={Math.max(Number(casas?.custo_casa_01 || 0), Number(casas?.custo_casa_02 || 0), 1)}
                cor="#b8893b"
              />
            </div>
            <p className="pt-1 text-xs text-gray-500">
              Inclui {brl(casas?.custo_comum)} de custos comuns rateados 50/50.
            </p>
          </div>
        </Card>

        <Card>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <CalendarDays className="h-4 w-4 text-[#1f3a5f]" /> Gasto por mês
          </p>
          {meses.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">Nenhum lançamento ainda.</p>
          ) : (
            <div className="space-y-2">
              {meses.slice(-6).map((m) => (
                <div key={m.mes}>
                  <div className="mb-0.5 flex justify-between text-xs text-gray-600">
                    <span>{mesBR(m.mes)}</span>
                    <span className="tnum">{brl(m.total)}</span>
                  </div>
                  <Barra valor={Number(m.total)} max={maxMes} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* previsto x realizado por etapa */}
      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">Previsto × Realizado por etapa</p>
          <Link href="/orcamento" className="flex items-center gap-1 text-xs font-medium text-[#1f3a5f] hover:underline">
            Editar orçamento <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {comPrevisto.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Defina os valores previstos em <Link href="/orcamento" className="underline">Orçamento</Link>.
          </p>
        ) : (
          <div className="space-y-3">
            {comPrevisto.map((e) => {
              const prev = Number(e.valor_previsto)
              const real = Number(e.realizado)
              const estourou = prev > 0 && real > prev
              return (
                <div key={e.id}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-gray-800">
                      {e.nome}
                      <span className="ml-2 text-gray-400">{pct(e.perc_avanco)} executado</span>
                    </span>
                    <span className="tnum text-gray-600">
                      {brl(real)} <span className="text-gray-400">de {brl(prev)}</span>
                      {estourou && <span className="ml-2 font-semibold text-red-600">+{brl(real - prev)}</span>}
                    </span>
                  </div>
                  <Barra valor={real} max={prev || real} cor={estourou ? '#dc2626' : '#1f3a5f'} />
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ultimos lancamentos + ultimo diario */}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Receipt className="h-4 w-4 text-[#1f3a5f]" /> Últimos lançamentos
            </p>
            <Link href="/lancamentos" className="flex items-center gap-1 text-xs font-medium text-[#1f3a5f] hover:underline">
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {ultimos.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Nenhum lançamento registrado.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {ultimos.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {l.fornecedor || l.descricao || LABEL_TIPO[l.tipo]}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {dataBR(l.data_emissao)} · {LABEL_TIPO[l.tipo]} · {l.etapas?.nome || 'sem etapa'} ·{' '}
                      {LABEL_CASA[l.casa]}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {l.status === 'a_pagar' && <Badge tom="vermelho">a pagar</Badge>}
                    <span className="tnum text-sm font-semibold text-gray-900">{brl(l.valor)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Último dia registrado</p>
            <Link href="/diario" className="flex items-center gap-1 text-xs font-medium text-[#1f3a5f] hover:underline">
              Diário <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {!ultimoDiario ? (
            <p className="py-8 text-center text-sm text-gray-400">Nenhum registro no diário.</p>
          ) : (
            <>
              <p className="text-base font-semibold text-gray-900">{dataBR(ultimoDiario.data)}</p>
              <p className="mt-1 text-xs text-gray-500">
                {ultimoDiario.equipe_dia?.length || 0} pessoa(s) ·{' '}
                {num(
                  (ultimoDiario.equipe_dia || []).reduce((s, e) => s + Number(e.horas || 0), 0),
                  1
                )}
                h de equipe
              </p>
              {ultimoDiario.descricao && (
                <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm text-gray-700">
                  {ultimoDiario.descricao}
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  )
}
