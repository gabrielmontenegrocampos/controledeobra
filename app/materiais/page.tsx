'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { brl, dataBR, num, LABEL_CASA } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import type { MaterialResumo } from '@/lib/types'
import {
  AvisoConfig,
  Badge,
  BotoesRelatorio,
  Campo,
  Card,
  Carregando,
  Erro,
  Stat,
  TituloSecao,
  Vazio,
  inputCls,
} from '@/components/ui'

type Entrada = {
  id: string
  material: string
  unidade: string | null
  quantidade: number
  valor_unit: number
  lancamentos: {
    data_emissao: string
    fornecedor: string | null
    nf_numero: string | null
    casa: string
  } | null
}

export default function MateriaisPage() {
  const [materiais, setMateriais] = useState<MaterialResumo[]>([])
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [m, e] = await Promise.all([
      supabase.from('v_materiais_resumo').select('*').order('valor_total', { ascending: false }),
      supabase
        .from('itens_lancamento')
        .select('id, material, unidade, quantidade, valor_unit, lancamentos(data_emissao, fornecedor, nf_numero, casa)')
        .order('created_at', { ascending: false }),
    ])
    if (m.error) setErro(mensagemErro(m.error))
    else setMateriais((m.data as MaterialResumo[]) || [])
    if (e.data) setEntradas(e.data as unknown as Entrada[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase()
    if (!b) return materiais
    return materiais.filter((m) => m.material.toLowerCase().includes(b))
  }, [materiais, busca])

  const totalGeral = filtrados.reduce((s, m) => s + Number(m.valor_total), 0)
  const totalCompras = entradas.length

  function historico(chave: string) {
    return entradas.filter((e) => e.material.trim().toLowerCase() === chave)
  }

  const colunas = ['Material', 'Un', 'Qtd total', 'Valor total', 'Preço médio', 'Menor', 'Maior', 'Compras', 'Última compra']
  const linhas = filtrados.map((m) => [
    m.material,
    m.unidade,
    num(m.qtd_total, 2),
    brl(m.valor_total),
    brl(m.preco_medio),
    brl(m.menor_preco),
    brl(m.maior_preco),
    String(m.qtd_compras),
    m.ultima_compra ? dataBR(m.ultima_compra) : '—',
  ])

  function gerarPDF() {
    exportarPDF({
      titulo: 'Relatório de Materiais',
      subtitulo: `${filtrados.length} material(is) distinto(s)`,
      colunas,
      linhas,
      resumo: [
        { rotulo: 'Total em materiais', valor: brl(totalGeral) },
        { rotulo: 'Materiais distintos', valor: String(filtrados.length) },
        { rotulo: 'Entradas registradas', valor: String(totalCompras) },
      ],
      alinharDireita: [2, 3, 4, 5, 6, 7],
      paisagem: true,
      arquivo: 'materiais',
    })
  }

  function gerarXLSX() {
    const linEntradas = entradas.map((e) => [
      e.lancamentos ? dataBR(e.lancamentos.data_emissao) : '—',
      e.material,
      e.unidade || '—',
      Number(e.quantidade),
      Number(e.valor_unit),
      Number(e.quantidade) * Number(e.valor_unit),
      e.lancamentos?.fornecedor || '—',
      e.lancamentos?.nf_numero || '—',
      e.lancamentos ? LABEL_CASA[e.lancamentos.casa] : '—',
    ])
    exportarXLSX('materiais', [
      { nome: 'Consolidado', colunas, linhas },
      {
        nome: 'Entradas',
        colunas: ['Data', 'Material', 'Un', 'Qtd', 'Valor unit.', 'Total', 'Fornecedor', 'NF', 'Casa'],
        linhas: linEntradas,
      },
    ])
  }

  return (
    <>
      <TituloSecao
        titulo="Materiais"
        descricao="Consolidado por material a partir dos itens das notas: quantidade comprada, preço médio e histórico."
      >
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat rotulo="Total em materiais" valor={brl(totalGeral)} tom="destaque" />
        <Stat rotulo="Materiais distintos" valor={String(filtrados.length)} />
        <Stat rotulo="Entradas registradas" valor={String(totalCompras)} detalhe="itens de nota lançados" />
      </div>

      <Card className="no-print mb-4">
        <Campo label="Buscar material">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="Ex.: cimento, areia, tijolo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </Campo>
      </Card>

      {carregando ? (
        <Carregando />
      ) : filtrados.length === 0 ? (
        <Vazio texto="Nenhum material lançado ainda. Registre uma nota com itens em Lançamentos." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="tabela-cartao w-full min-w-[940px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">Un</th>
                <th className="px-4 py-3 text-right">Qtd total</th>
                <th className="px-4 py-3 text-right">Valor total</th>
                <th className="px-4 py-3 text-right">Preço médio</th>
                <th className="px-4 py-3 text-right">Faixa de preço</th>
                <th className="px-4 py-3 text-center">Compras</th>
                <th className="px-4 py-3">Última</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m) => {
                const hist = historico(m.chave)
                const variou = Number(m.maior_preco) > Number(m.menor_preco)
                return (
                  <Fragment key={`${m.chave}-${m.unidade}`}>
                    <tr
                      className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50/60"
                      onClick={() => setAberto(aberto === m.chave ? null : m.chave)}
                    >
                      <td data-rotulo="Material" className="px-4 py-2.5 font-medium text-gray-900">
                        {m.material}
                        <span className="ml-2 text-[11px] font-normal text-[#1f3a5f] underline">
                          {aberto === m.chave ? 'ocultar' : 'histórico'}
                        </span>
                      </td>
                      <td data-rotulo="Un" className="px-4 py-2.5 text-gray-600">{m.unidade}</td>
                      <td data-rotulo="Qtd total" className="tnum px-4 py-2.5 text-right">{num(m.qtd_total, 2)}</td>
                      <td data-rotulo="Valor total" className="tnum px-4 py-2.5 text-right font-semibold">{brl(m.valor_total)}</td>
                      <td data-rotulo="Preço médio" className="tnum px-4 py-2.5 text-right">{brl(m.preco_medio)}</td>
                      <td data-rotulo="Faixa de preço" className="tnum px-4 py-2.5 text-right text-xs text-gray-600">
                        {variou ? (
                          <>
                            {brl(m.menor_preco)} — {brl(m.maior_preco)}
                          </>
                        ) : (
                          <Badge tom="cinza">preço único</Badge>
                        )}
                      </td>
                      <td data-rotulo="Compras" className="tnum px-4 py-2.5 text-center">{m.qtd_compras}</td>
                      <td data-rotulo="Última" className="px-4 py-2.5 text-gray-600">{m.ultima_compra ? dataBR(m.ultima_compra) : '—'}</td>
                    </tr>

                    {aberto === m.chave && (
                      <tr className="bg-gray-50/80">
                        <td colSpan={8} className="px-4 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-gray-500">
                                <th className="py-1">Data</th>
                                <th className="py-1">Fornecedor</th>
                                <th className="py-1">NF</th>
                                <th className="py-1">Casa</th>
                                <th className="py-1 text-right">Qtd</th>
                                <th className="py-1 text-right">Valor unit.</th>
                                <th className="py-1 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {hist.map((h) => (
                                <tr key={h.id} className="border-t border-gray-200">
                                  <td className="py-1">{h.lancamentos ? dataBR(h.lancamentos.data_emissao) : '—'}</td>
                                  <td className="py-1 font-medium text-gray-800">{h.lancamentos?.fornecedor || '—'}</td>
                                  <td className="py-1">{h.lancamentos?.nf_numero || '—'}</td>
                                  <td className="py-1">{h.lancamentos ? LABEL_CASA[h.lancamentos.casa] : '—'}</td>
                                  <td className="tnum py-1 text-right">{num(h.quantidade, 2)}</td>
                                  <td className="tnum py-1 text-right">{brl(h.valor_unit)}</td>
                                  <td className="tnum py-1 text-right font-medium">
                                    {brl(Number(h.quantidade) * Number(h.valor_unit))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={3} className="px-4 py-3">Total</td>
                <td className="tnum px-4 py-3 text-right">{brl(totalGeral)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </>
  )
}
