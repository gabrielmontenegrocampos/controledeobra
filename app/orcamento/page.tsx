'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2, Save, Pencil, Plus, CornerDownRight } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { brl, limparNumerico, num, numEnxuto, parseMoeda, pct } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import { achatar, montarArvore, totaisGerais, type NoEtapa } from '@/lib/etapas'
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
  InputMoeda,
  Modal,
  Stat,
  TituloSecao,
  Vazio,
  btnCls,
  btnPrimarioCls,
  inputCls,
} from '@/components/ui'

type FormEtapa = {
  id?: string
  nome: string
  grupo: string
  valor_previsto: string
  ordem: string
  etapa_pai_id: string
}

const FORM_VAZIO: FormEtapa = {
  nome: '',
  grupo: '',
  valor_previsto: '',
  ordem: '',
  etapa_pai_id: '',
}

export default function OrcamentoPage() {
  const [etapas, setEtapas] = useState<EtapaResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<FormEtapa>(FORM_VAZIO)
  const [semEtapa, setSemEtapa] = useState({ total: 0, quantidade: 0 })

  const carregar = useCallback(async () => {
    const [resumo, soltos] = await Promise.all([
      supabase.from('v_etapas_resumo').select('*').order('ordem'),
      supabase.from('lancamentos').select('valor').is('etapa_id', null),
    ])
    if (resumo.error) setErro(mensagemErro(resumo.error))
    else setEtapas((resumo.data as EtapaResumo[]) || [])
    if (soltos.data)
      setSemEtapa({
        total: soltos.data.reduce((soma, l) => soma + Number(l.valor), 0),
        quantidade: soltos.data.length,
      })
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const arvore = useMemo(() => montarArvore(etapas), [etapas])
  const linhasArvore = useMemo(() => achatar(arvore), [arvore])
  const raizes = arvore
  const totais = totaisGerais(arvore)

  async function salvarCampo(id: string, campo: 'valor_previsto' | 'perc_avanco', valor: number) {
    const { error } = await supabase.from('etapas').update({ [campo]: valor }).eq('id', id)
    if (error) setErro(mensagemErro(error))
    else carregar()
  }

  function abrirNova(paiId?: string) {
    const irmas = paiId
      ? etapas.filter((e) => e.etapa_pai_id === paiId)
      : etapas.filter((e) => !e.etapa_pai_id)
    setForm({
      ...FORM_VAZIO,
      etapa_pai_id: paiId || '',
      ordem: String((irmas.length + 1) * 10),
    })
    setModal(true)
  }

  function abrirEdicao(n: NoEtapa) {
    setForm({
      id: n.id,
      nome: n.nome,
      grupo: n.grupo || '',
      valor_previsto: num(n.valor_previsto),
      ordem: String(n.ordem),
      etapa_pai_id: n.etapa_pai_id || '',
    })
    setModal(true)
  }

  async function salvarEtapa() {
    if (!form.nome.trim()) return
    setSalvando(true)
    setErro(null)

    const payload = {
      nome: form.nome.trim(),
      grupo: form.grupo.trim() || null,
      ordem: Number(form.ordem) || 0,
      etapa_pai_id: form.etapa_pai_id || null,
      ...(form.id ? {} : { valor_previsto: parseMoeda(form.valor_previsto) }),
    }

    const { error } = form.id
      ? await supabase.from('etapas').update(payload).eq('id', form.id)
      : await supabase.from('etapas').insert(payload)

    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    setForm(FORM_VAZIO)
    setModal(false)
    carregar()
  }

  async function excluirEtapa(n: NoEtapa) {
    if (n.realizadoTotal > 0) {
      return setErro(
        `"${n.nome}" tem ${brl(n.realizadoTotal)} em lançamentos${
          n.temFilhas ? ' (contando as subetapas)' : ''
        }. Mova os lançamentos para outra etapa antes de excluir.`
      )
    }
    const aviso = n.temFilhas
      ? `Excluir "${n.nome}" e as ${n.filhas.length} subetapa(s) dentro dela?`
      : `Excluir a etapa "${n.nome}"?`
    if (!confirm(aviso)) return

    const { error } = await supabase.from('etapas').delete().eq('id', n.id)
    if (error) setErro(mensagemErro(error))
    else carregar()
  }

  // ---------- relatorios ----------
  const colunas = ['Etapa', 'Grupo', 'Previsto', 'Realizado', 'Saldo', '% Fin.', '% Avanço']
  const linhas = linhasArvore.map((n) => [
    `${'    '.repeat(n.nivel)}${n.nivel > 0 ? '› ' : ''}${n.nome}`,
    n.grupo || '—',
    brl(n.previstoTotal),
    brl(n.realizadoTotal),
    brl(n.previstoTotal - n.realizadoTotal),
    n.previstoTotal > 0 ? pct((n.realizadoTotal / n.previstoTotal) * 100) : '—',
    pct(n.avancoTotal),
  ])

  const linhasComSoltos =
    semEtapa.total > 0
      ? [...linhas, ['Sem etapa', '—', brl(0), brl(semEtapa.total), brl(-semEtapa.total), '—', '—']]
      : linhas

  function gerarPDF() {
    exportarPDF({
      titulo: 'Orçamento — Previsto x Realizado',
      colunas,
      linhas: linhasComSoltos,
      resumo: [
        { rotulo: 'Previsto', valor: brl(totais.previsto) },
        { rotulo: 'Realizado', valor: brl(totais.realizado + semEtapa.total) },
        { rotulo: 'Saldo', valor: brl(totais.previsto - totais.realizado - semEtapa.total) },
        { rotulo: 'Avanço físico', valor: pct(totais.avanco) },
      ],
      alinharDireita: [2, 3, 4, 5, 6],
      paisagem: true,
      arquivo: 'orcamento-lagoa-santa',
    })
  }

  function gerarXLSX() {
    exportarXLSX('orcamento-lagoa-santa', [{ nome: 'Orçamento', colunas, linhas: linhasComSoltos }])
  }

  return (
    <>
      <TituloSecao
        titulo="Orçamento e Etapas"
        descricao="A linha-base do previsto. Uma etapa pode ter subetapas — a mãe soma as filhas sozinha."
      >
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
        <BotaoNovo onClick={() => abrirNova()}>Nova etapa</BotaoNovo>
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat rotulo="Previsto" valor={brl(totais.previsto)} tom="destaque" />
        <Stat
          rotulo="Realizado"
          valor={brl(totais.realizado + semEtapa.total)}
          detalhe={semEtapa.total > 0 ? `${brl(semEtapa.total)} sem etapa` : undefined}
        />
        <Stat
          rotulo="Saldo do orçamento"
          valor={brl(totais.previsto - totais.realizado - semEtapa.total)}
          tom={totais.previsto - totais.realizado - semEtapa.total < 0 ? 'negativo' : 'positivo'}
          detalhe={totais.aPagar > 0 ? `${brl(totais.aPagar)} ainda a pagar` : undefined}
        />
        <Stat
          rotulo="Avanço físico"
          valor={pct(totais.avanco)}
          detalhe={`Financeiro: ${
            totais.previsto > 0 ? pct((totais.realizado / totais.previsto) * 100) : '—'
          }`}
        />
      </div>

      {carregando ? (
        <Carregando />
      ) : linhasArvore.length === 0 ? (
        <Vazio texto="Nenhuma etapa ainda. Rode o schema.sql no Supabase ou crie a primeira etapa." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[980px] text-sm">
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
              {linhasArvore.map((n) => {
                const estourou = n.realizadoTotal > n.previstoTotal && n.previstoTotal > 0
                const filha = n.nivel > 0
                return (
                  <Fragment key={n.id}>
                    <tr
                      className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/60 ${
                        filha ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5" style={{ paddingLeft: `${16 + n.nivel * 24}px` }}>
                        <span className="flex items-start gap-1.5">
                          {filha && (
                            <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                          )}
                          <span>
                            <span
                              className={`block ${
                                filha ? 'text-gray-800' : 'font-semibold text-gray-900'
                              }`}
                            >
                              {n.nome}
                            </span>
                            {n.grupo && <span className="block text-xs text-gray-500">{n.grupo}</span>}
                            {n.temFilhas && (
                              <span className="block text-[11px] text-gray-400">
                                {n.filhas.length} subetapa(s)
                              </span>
                            )}
                          </span>
                        </span>
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        {n.temFilhas ? (
                          <span className="tnum block text-gray-700">
                            {brl(n.previstoTotal)}
                            <span className="block text-[10px] font-normal text-gray-400">
                              soma das subetapas
                            </span>
                          </span>
                        ) : (
                          <input
                            type="text"
                            inputMode="decimal"
                            defaultValue={num(n.valor_previsto)}
                            className={`${inputCls} tnum w-32 text-right`}
                            onFocus={(ev) => ev.target.select()}
                            onChange={(ev) => {
                              const d = ev.target.value.replace(/\D/g, '').slice(0, 15)
                              ev.target.value = d ? num(Number(d) / 100, 2) : ''
                            }}
                            onBlur={(ev) => {
                              const v = parseMoeda(ev.target.value)
                              ev.target.value = num(v)
                              if (v !== Number(n.valor_previsto)) salvarCampo(n.id, 'valor_previsto', v)
                            }}
                          />
                        )}
                      </td>

                      <td className="tnum px-4 py-2.5 text-right">
                        {brl(n.realizadoTotal)}
                        {n.aPagarTotal > 0 && (
                          <span className="block text-[11px] text-amber-700">
                            {brl(n.aPagarTotal)} a pagar
                          </span>
                        )}
                      </td>

                      <td
                        className={`tnum px-4 py-2.5 text-right ${
                          estourou ? 'font-semibold text-red-600' : 'text-gray-700'
                        }`}
                      >
                        {brl(n.previstoTotal - n.realizadoTotal)}
                      </td>

                      <td className="px-4 py-2.5">
                        <Barra
                          valor={n.realizadoTotal}
                          max={n.previstoTotal || n.realizadoTotal}
                          cor={estourou ? '#dc2626' : '#1f3a5f'}
                        />
                        <span className="tnum mt-1 block text-[11px] text-gray-500">
                          {n.previstoTotal > 0
                            ? pct((n.realizadoTotal / n.previstoTotal) * 100)
                            : 'sem previsto'}
                        </span>
                      </td>

                      <td className="px-4 py-2.5 text-center">
                        {n.temFilhas ? (
                          <span className="tnum block text-gray-700">
                            {pct(n.avancoTotal)}
                            <span className="block text-[10px] text-gray-400">média das filhas</span>
                          </span>
                        ) : (
                          <input
                            type="text"
                            inputMode="decimal"
                            defaultValue={numEnxuto(n.perc_avanco, 1)}
                            className={`${inputCls} tnum w-20 text-center`}
                            onFocus={(ev) => ev.target.select()}
                            onChange={(ev) => {
                              ev.target.value = limparNumerico(ev.target.value)
                            }}
                            onBlur={(ev) => {
                              const v = Math.max(0, Math.min(100, parseMoeda(ev.target.value)))
                              ev.target.value = numEnxuto(v, 1)
                              if (v !== Number(n.perc_avanco)) salvarCampo(n.id, 'perc_avanco', v)
                            }}
                          />
                        )}
                      </td>

                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          {!filha && (
                            <button
                              onClick={() => abrirNova(n.id)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                              title="Adicionar subetapa"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => abrirEdicao(n)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                            title="Editar etapa"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => excluirEtapa(n)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Excluir etapa"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
            {semEtapa.total > 0 && (
              <tbody>
                <tr className="border-t border-amber-200 bg-amber-50">
                  <td className="px-4 py-2.5">
                    <span className="block font-medium text-amber-900">Sem etapa</span>
                    <span className="block text-xs text-amber-700">
                      {semEtapa.quantidade} lançamento(s) ainda não classificados
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-amber-700">—</td>
                  <td className="tnum px-4 py-2.5 text-right font-semibold text-amber-900">
                    {brl(semEtapa.total)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-amber-700">—</td>
                  <td className="px-4 py-2.5 text-xs text-amber-700">
                    fora da comparação por etapa
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            )}
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="tnum px-4 py-3 text-right">{brl(totais.previsto)}</td>
                <td className="tnum px-4 py-3 text-right">{brl(totais.realizado + semEtapa.total)}</td>
                <td className="tnum px-4 py-3 text-right">
                  {brl(totais.previsto - totais.realizado - semEtapa.total)}
                </td>
                <td className="px-4 py-3 text-xs font-normal text-gray-500">
                  {totais.previsto > 0
                    ? `${pct(((totais.realizado + semEtapa.total) / totais.previsto) * 100)} do orçamento`
                    : '—'}
                </td>
                <td className="tnum px-4 py-3 text-center">{pct(totais.avanco)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
            Valor e % avanço salvam sozinhos ao sair do campo. Use o <strong>+</strong> para criar
            uma subetapa e o lápis para renomear ou reordenar.
          </p>
        </Card>
      )}

      {/* ---------- modal ---------- */}
      <Modal
        aberto={modal}
        titulo={form.id ? 'Editar etapa' : form.etapa_pai_id ? 'Nova subetapa' : 'Nova etapa'}
        onFechar={() => setModal(false)}
        largura="max-w-lg"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome" className="sm:col-span-2">
            <input
              className={inputCls}
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Impermeabilização"
            />
          </Campo>

          <Campo
            label="Subetapa de"
            className="sm:col-span-2"
            dica="Deixe em branco para ser uma etapa principal"
          >
            <select
              className={inputCls}
              value={form.etapa_pai_id}
              onChange={(e) => setForm({ ...form, etapa_pai_id: e.target.value })}
            >
              <option value="">Nenhuma — etapa principal</option>
              {raizes
                .filter((r) => r.id !== form.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
            </select>
          </Campo>

          <Campo label="Grupo (opcional)">
            <input
              className={inputCls}
              value={form.grupo}
              onChange={(e) => setForm({ ...form, grupo: e.target.value })}
              placeholder="Ex.: Acabamento"
            />
          </Campo>

          {!form.id && (
            <Campo label="Valor previsto (R$)" dica="Digite só os números: 25000 vira 250,00">
              <InputMoeda
                valor={form.valor_previsto}
                onChange={(v) => setForm({ ...form, valor_previsto: v })}
              />
            </Campo>
          )}

          <Campo label="Ordem" dica="Define a posição na lista">
            <input
              type="number"
              className={`${inputCls} tnum`}
              value={form.ordem}
              onChange={(e) => setForm({ ...form, ordem: e.target.value })}
            />
          </Campo>
        </div>

        {form.id && (
          <p className="mt-3 text-[11px] text-gray-500">
            O valor previsto e o % de avanço são editados direto na tabela.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button className={btnCls} onClick={() => setModal(false)}>
            Cancelar
          </button>
          <button onClick={salvarEtapa} disabled={salvando || !form.nome.trim()} className={btnPrimarioCls}>
            <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>
    </>
  )
}
