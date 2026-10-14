'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trash2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { brl, num, parseMoeda, pct } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import type { EtapaResumo } from '@/lib/types'
import {
  AvisoConfig,
  BotaoNovo,
  BotoesRelatorio,
  Barra,
  Campo,
  Card,
  Carregando,
  Erro,
  Modal,
  Stat,
  TituloSecao,
  Vazio,
  btnPrimarioCls,
  inputCls,
} from '@/components/ui'

export default function OrcamentoPage() {
  const [etapas, setEtapas] = useState<EtapaResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [nova, setNova] = useState({ nome: '', grupo: '', valor_previsto: '', ordem: '' })

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('v_etapas_resumo')
      .select('*')
      .order('ordem')
    if (error) setErro(error.message)
    else setEtapas((data as EtapaResumo[]) || [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvarCampo(id: string, campo: 'valor_previsto' | 'perc_avanco', valor: number) {
    const { error } = await supabase.from('etapas').update({ [campo]: valor }).eq('id', id)
    if (error) setErro(error.message)
    else carregar()
  }

  async function criarEtapa() {
    if (!nova.nome.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('etapas').insert({
      nome: nova.nome.trim(),
      grupo: nova.grupo.trim() || null,
      valor_previsto: parseMoeda(nova.valor_previsto),
      ordem: Number(nova.ordem) || (etapas.length + 1) * 10,
    })
    setSalvando(false)
    if (error) return setErro(error.message)
    setNova({ nome: '', grupo: '', valor_previsto: '', ordem: '' })
    setModal(false)
    carregar()
  }

  async function excluirEtapa(e: EtapaResumo) {
    if (e.realizado > 0) {
      setErro(
        `A etapa "${e.nome}" tem ${brl(e.realizado)} em lançamentos. Mova os lançamentos antes de excluí-la.`
      )
      return
    }
    if (!confirm(`Excluir a etapa "${e.nome}"?`)) return
    const { error } = await supabase.from('etapas').delete().eq('id', e.id)
    if (error) setErro(error.message)
    else carregar()
  }

  const totPrevisto = etapas.reduce((s, e) => s + Number(e.valor_previsto), 0)
  const totRealizado = etapas.reduce((s, e) => s + Number(e.realizado), 0)
  const totAPagar = etapas.reduce((s, e) => s + Number(e.a_pagar), 0)
  const avancoFisico =
    totPrevisto > 0
      ? etapas.reduce((s, e) => s + Number(e.perc_avanco) * Number(e.valor_previsto), 0) / totPrevisto
      : 0

  const colunas = ['Etapa', 'Grupo', 'Previsto', 'Realizado', 'Saldo', '% Fin.', '% Avanço']
  const linhas = etapas.map((e) => [
    e.nome,
    e.grupo || '—',
    brl(e.valor_previsto),
    brl(e.realizado),
    brl(e.saldo),
    e.perc_financeiro != null ? pct(e.perc_financeiro) : '—',
    pct(e.perc_avanco),
  ])

  function gerarPDF() {
    exportarPDF({
      titulo: 'Orçamento — Previsto x Realizado',
      colunas,
      linhas,
      resumo: [
        { rotulo: 'Previsto', valor: brl(totPrevisto) },
        { rotulo: 'Realizado', valor: brl(totRealizado) },
        { rotulo: 'Saldo', valor: brl(totPrevisto - totRealizado) },
        { rotulo: 'Avanço físico', valor: pct(avancoFisico) },
      ],
      alinharDireita: [2, 3, 4, 5, 6],
      paisagem: true,
      arquivo: 'orcamento-lagoa-santa',
    })
  }

  function gerarXLSX() {
    exportarXLSX('orcamento-lagoa-santa', [{ nome: 'Orçamento', colunas, linhas }])
  }

  return (
    <>
      <TituloSecao
        titulo="Orçamento e Etapas"
        descricao="A linha-base do previsto. Edite o valor e o % de avanço direto na tabela."
      >
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
        <BotaoNovo onClick={() => setModal(true)}>Nova etapa</BotaoNovo>
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat rotulo="Previsto" valor={brl(totPrevisto)} tom="destaque" />
        <Stat rotulo="Realizado" valor={brl(totRealizado)} />
        <Stat
          rotulo="Saldo do orçamento"
          valor={brl(totPrevisto - totRealizado)}
          tom={totPrevisto - totRealizado < 0 ? 'negativo' : 'positivo'}
          detalhe={totAPagar > 0 ? `${brl(totAPagar)} ainda a pagar` : undefined}
        />
        <Stat
          rotulo="Avanço físico"
          valor={pct(avancoFisico)}
          detalhe={`Financeiro: ${totPrevisto > 0 ? pct((totRealizado / totPrevisto) * 100) : '—'}`}
        />
      </div>

      {carregando ? (
        <Carregando />
      ) : etapas.length === 0 ? (
        <Vazio texto="Nenhuma etapa ainda. Rode o schema.sql no Supabase ou crie a primeira etapa." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Etapa</th>
                <th className="px-4 py-3 text-right">Previsto (R$)</th>
                <th className="px-4 py-3 text-right">Realizado</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3">Execução financeira</th>
                <th className="px-4 py-3 text-center">% Avanço</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {etapas.map((e) => {
                const estourou = Number(e.realizado) > Number(e.valor_previsto) && Number(e.valor_previsto) > 0
                return (
                  <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{e.nome}</p>
                      {e.grupo && <p className="text-xs text-gray-500">{e.grupo}</p>}
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="text"
                        defaultValue={num(e.valor_previsto)}
                        className={`${inputCls} tnum w-32 text-right`}
                        onBlur={(ev) => {
                          const v = parseMoeda(ev.target.value)
                          if (v !== Number(e.valor_previsto)) salvarCampo(e.id, 'valor_previsto', v)
                        }}
                      />
                    </td>

                    <td className="tnum px-4 py-2.5 text-right">
                      {brl(e.realizado)}
                      {Number(e.a_pagar) > 0 && (
                        <span className="block text-[11px] text-amber-700">
                          {brl(e.a_pagar)} a pagar
                        </span>
                      )}
                    </td>

                    <td
                      className={`tnum px-4 py-2.5 text-right ${
                        estourou ? 'font-semibold text-red-600' : 'text-gray-700'
                      }`}
                    >
                      {brl(e.saldo)}
                    </td>

                    <td className="px-4 py-2.5">
                      <Barra
                        valor={Number(e.realizado)}
                        max={Number(e.valor_previsto) || Number(e.realizado)}
                        cor={estourou ? '#dc2626' : '#1f3a5f'}
                      />
                      <span className="tnum mt-1 block text-[11px] text-gray-500">
                        {e.perc_financeiro != null ? pct(e.perc_financeiro) : 'sem previsto'}
                      </span>
                    </td>

                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        defaultValue={Number(e.perc_avanco)}
                        className={`${inputCls} tnum w-20 text-center`}
                        onBlur={(ev) => {
                          const v = Math.max(0, Math.min(100, Number(ev.target.value) || 0))
                          if (v !== Number(e.perc_avanco)) salvarCampo(e.id, 'perc_avanco', v)
                        }}
                      />
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => excluirEtapa(e)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Excluir etapa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="tnum px-4 py-3 text-right">{brl(totPrevisto)}</td>
                <td className="tnum px-4 py-3 text-right">{brl(totRealizado)}</td>
                <td className="tnum px-4 py-3 text-right">{brl(totPrevisto - totRealizado)}</td>
                <td className="px-4 py-3 text-xs font-normal text-gray-500">
                  {totPrevisto > 0 ? `${pct((totRealizado / totPrevisto) * 100)} do orçamento` : '—'}
                </td>
                <td className="tnum px-4 py-3 text-center">{pct(avancoFisico)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
            As alterações salvam automaticamente ao sair do campo.
          </p>
        </Card>
      )}

      <Modal aberto={modal} titulo="Nova etapa" onFechar={() => setModal(false)} largura="max-w-lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome da etapa" className="sm:col-span-2">
            <input
              className={inputCls}
              value={nova.nome}
              onChange={(e) => setNova({ ...nova, nome: e.target.value })}
              placeholder="Ex.: Impermeabilização"
            />
          </Campo>
          <Campo label="Grupo (opcional)">
            <input
              className={inputCls}
              value={nova.grupo}
              onChange={(e) => setNova({ ...nova, grupo: e.target.value })}
              placeholder="Ex.: Acabamento"
            />
          </Campo>
          <Campo label="Valor previsto (R$)">
            <input
              className={`${inputCls} tnum`}
              value={nova.valor_previsto}
              onChange={(e) => setNova({ ...nova, valor_previsto: e.target.value })}
              placeholder="0,00"
            />
          </Campo>
          <Campo label="Ordem" dica="Define a posição na lista">
            <input
              type="number"
              className={`${inputCls} tnum`}
              value={nova.ordem}
              onChange={(e) => setNova({ ...nova, ordem: e.target.value })}
              placeholder={`${(etapas.length + 1) * 10}`}
            />
          </Campo>
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={criarEtapa} disabled={salvando || !nova.nome.trim()} className={btnPrimarioCls}>
            <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar etapa'}
          </button>
        </div>
      </Modal>
    </>
  )
}
