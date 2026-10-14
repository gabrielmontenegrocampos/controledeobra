'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Pencil,
  Trash2,
  Save,
  Paperclip,
  UserPlus,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { brl, dataBR, hoje, num, parseMoeda, pct, LABEL_CASA } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import type { Aporte, CaixaResumo, Investidor, InvestidorResumo, Lancamento } from '@/lib/types'
import { Anexo } from '@/components/anexo'
import {
  AvisoConfig,
  Barra,
  BotoesRelatorio,
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

type FormAporte = {
  id?: string
  investidor_id: string
  data: string
  valor: string
  forma: string
  observacao: string
  comprovante_url: string | null
}

const FORM_VAZIO: FormAporte = {
  investidor_id: '',
  data: hoje(),
  valor: '',
  forma: 'Pix',
  observacao: '',
  comprovante_url: null,
}

export default function CaixaPage() {
  const [resumo, setResumo] = useState<CaixaResumo | null>(null)
  const [investidores, setInvestidores] = useState<InvestidorResumo[]>([])
  const [lista, setLista] = useState<Investidor[]>([])
  const [aportes, setAportes] = useState<Aporte[]>([])
  const [pagos, setPagos] = useState<Lancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [filtroInvestidor, setFiltroInvestidor] = useState('')
  const [mostrarAportes, setMostrarAportes] = useState(false)

  const [modalAporte, setModalAporte] = useState(false)
  const [modalInvestidor, setModalInvestidor] = useState(false)
  const [form, setForm] = useState<FormAporte>(FORM_VAZIO)
  const [novoInvestidor, setNovoInvestidor] = useState({ nome: '', observacao: '' })

  const carregar = useCallback(async () => {
    const [r, inv, lis, ap, pg] = await Promise.all([
      supabase.from('v_caixa_resumo').select('*').maybeSingle(),
      supabase.from('v_investidores_resumo').select('*').order('total_geral', { ascending: false }),
      supabase.from('investidores').select('*').order('nome'),
      supabase.from('aportes').select('*, investidores(nome)').order('data', { ascending: false }),
      supabase
        .from('lancamentos')
        .select('*, etapas(nome)')
        .eq('status', 'pago')
        .order('data_pagamento', { ascending: false }),
    ])
    if (r.error) setErro(mensagemErro(r.error))
    else setResumo(r.data as CaixaResumo)
    if (inv.data) setInvestidores(inv.data as InvestidorResumo[])
    if (lis.data) setLista(lis.data as Investidor[])
    if (ap.data) setAportes(ap.data as Aporte[])
    if (pg.data) setPagos(pg.data as Lancamento[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const nomeDe = useCallback(
    (id: string | null) => (id ? lista.find((i) => i.id === id)?.nome || null : null),
    [lista]
  )

  const contasPorInvestidor = useMemo(
    () =>
      pagos
        .filter((l) => l.investidor_id)
        .filter((l) => !filtroInvestidor || l.investidor_id === filtroInvestidor),
    [pagos, filtroInvestidor]
  )

  const semInvestidor = useMemo(() => pagos.filter((l) => !l.investidor_id), [pagos])

  const totalInvestido = Number(resumo?.total_investido || 0)

  async function salvarAporte() {
    if (!form.investidor_id) return setErro('Escolha o investidor.')
    const valor = parseMoeda(form.valor)
    if (valor <= 0) return setErro('Informe um valor maior que zero.')

    setSalvando(true)
    setErro(null)
    const payload = {
      investidor_id: form.investidor_id,
      data: form.data,
      valor,
      forma: form.forma.trim() || null,
      observacao: form.observacao.trim() || null,
      comprovante_url: form.comprovante_url,
    }
    const { error } = form.id
      ? await supabase.from('aportes').update(payload).eq('id', form.id)
      : await supabase.from('aportes').insert(payload)
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    setModalAporte(false)
    setForm(FORM_VAZIO)
    carregar()
  }

  async function criarInvestidor() {
    if (!novoInvestidor.nome.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('investidores').insert({
      nome: novoInvestidor.nome.trim(),
      observacao: novoInvestidor.observacao.trim() || null,
    })
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    setNovoInvestidor({ nome: '', observacao: '' })
    setModalInvestidor(false)
    carregar()
  }

  async function excluirAporte(a: Aporte) {
    if (!confirm(`Excluir o aporte de ${brl(a.valor)} de ${a.investidores?.nome}?`)) return
    const { error } = await supabase.from('aportes').delete().eq('id', a.id)
    if (error) setErro(mensagemErro(error))
    else carregar()
  }

  function abrirEdicao(a: Aporte) {
    setForm({
      id: a.id,
      investidor_id: a.investidor_id,
      data: a.data,
      valor: num(a.valor),
      forma: a.forma || '',
      observacao: a.observacao || '',
      comprovante_url: a.comprovante_url,
    })
    setModalAporte(true)
  }

  // ---------- relatorios ----------
  const colInv = ['Investidor', 'Contas pagas', 'Valor em contas', 'Aportes em dinheiro', 'Total investido', 'Participação']
  const linInv = investidores.map((i) => [
    i.nome,
    String(i.qtd_contas),
    brl(i.total_pago_contas),
    brl(i.total_aportado),
    brl(i.total_geral),
    pct(i.perc_participacao),
  ])

  const colContas = ['Data', 'Investidor', 'Fornecedor / Descrição', 'Etapa', 'Casa', 'Valor']
  const linContas = contasPorInvestidor.map((l) => [
    dataBR(l.data_pagamento || l.data_emissao),
    nomeDe(l.investidor_id) || '—',
    l.fornecedor || l.descricao || '—',
    l.etapas?.nome || '—',
    LABEL_CASA[l.casa],
    brl(l.valor),
  ])

  function gerarPDF() {
    exportarPDF({
      titulo: 'Investimento por Sócio',
      colunas: colInv,
      linhas: linInv,
      resumo: [
        { rotulo: 'Total investido', valor: brl(totalInvestido) },
        { rotulo: 'Pago direto pelos sócios', valor: brl(resumo?.pago_investidores) },
        { rotulo: 'Aportes em dinheiro', valor: brl(resumo?.total_aportado) },
        { rotulo: 'A pagar', valor: brl(resumo?.total_a_pagar) },
      ],
      alinharDireita: [1, 2, 3, 4, 5],
      paisagem: true,
      arquivo: 'investimento-por-socio',
    })
  }

  function gerarXLSX() {
    exportarXLSX('investimento-por-socio', [
      { nome: 'Investidores', colunas: colInv, linhas: linInv },
      { nome: 'Contas pagas', colunas: colContas, linhas: linContas },
      {
        nome: 'Aportes',
        colunas: ['Data', 'Investidor', 'Forma', 'Observação', 'Valor'],
        linhas: aportes.map((a) => [
          dataBR(a.data),
          a.investidores?.nome || '—',
          a.forma || '—',
          a.observacao || '—',
          Number(a.valor),
        ]),
      },
    ])
  }

  return (
    <>
      <TituloSecao
        titulo="Caixa e Investidores"
        descricao="Quanto cada um colocou na obra: as contas que ele mesmo pagou mais os aportes em dinheiro."
      >
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
        <button className={btnCls} onClick={() => setModalInvestidor(true)}>
          <UserPlus className="h-4 w-4" /> Novo investidor
        </button>
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          rotulo="Total investido"
          valor={brl(totalInvestido)}
          tom="destaque"
          detalhe={`${investidores.length} investidor(es)`}
        />
        <Stat
          rotulo="Pago direto pelos sócios"
          valor={brl(resumo?.pago_investidores)}
          detalhe="contas pagas por cada um"
        />
        <Stat
          rotulo="Aportes em dinheiro"
          valor={brl(resumo?.total_aportado)}
          detalhe="entregues ao caixa comum"
        />
        <Stat
          rotulo="Saldo do caixa comum"
          valor={brl(resumo?.saldo)}
          tom={Number(resumo?.saldo) < 0 ? 'negativo' : 'positivo'}
          detalhe={`${brl(resumo?.total_a_pagar)} ainda a pagar`}
        />
      </div>

      {semInvestidor.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <p className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              <strong>{semInvestidor.length} conta(s) paga(s)</strong> sem investidor definido,
              somando {brl(semInvestidor.reduce((s, l) => s + Number(l.valor), 0))}. Elas contam como
              pagas pelo caixa comum.{' '}
              <Link href="/lancamentos" className="underline">
                abrir lançamentos
              </Link>
            </span>
          </p>
        </Card>
      )}

      {carregando ? (
        <Carregando />
      ) : (
        <>
          {/* ---------- investidores ---------- */}
          {investidores.length === 0 ? (
            <Vazio texto="Nenhum investidor cadastrado. Clique em 'Novo investidor' para criar o primeiro." />
          ) : (
            <Card className="mb-6 overflow-x-auto p-0">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Investidor</th>
                    <th className="px-4 py-3 text-center">Contas pagas</th>
                    <th className="px-4 py-3 text-right">Valor em contas</th>
                    <th className="px-4 py-3 text-right">Aportes</th>
                    <th className="px-4 py-3 text-right">Total investido</th>
                    <th className="px-4 py-3">Participação</th>
                  </tr>
                </thead>
                <tbody>
                  {investidores.map((i) => (
                    <tr key={i.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{i.nome}</td>
                      <td className="tnum px-4 py-2.5 text-center">
                        {i.qtd_contas > 0 ? (
                          <button
                            onClick={() =>
                              setFiltroInvestidor(filtroInvestidor === i.id ? '' : i.id)
                            }
                            className="text-[#1f3a5f] underline"
                          >
                            {i.qtd_contas}
                          </button>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right">{brl(i.total_pago_contas)}</td>
                      <td className="tnum px-4 py-2.5 text-right text-gray-600">
                        {brl(i.total_aportado)}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right font-semibold">{brl(i.total_geral)}</td>
                      <td className="px-4 py-2.5">
                        <Barra valor={Number(i.total_geral)} max={totalInvestido} cor="#b8893b" />
                        <span className="tnum mt-1 block text-[11px] text-gray-500">
                          {pct(i.perc_participacao)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3">Total</td>
                    <td className="tnum px-4 py-3 text-center">
                      {investidores.reduce((s, i) => s + Number(i.qtd_contas), 0)}
                    </td>
                    <td className="tnum px-4 py-3 text-right">{brl(resumo?.pago_investidores)}</td>
                    <td className="tnum px-4 py-3 text-right">{brl(resumo?.total_aportado)}</td>
                    <td className="tnum px-4 py-3 text-right">{brl(totalInvestido)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </Card>
          )}

          {/* ---------- contas pagas por investidor ---------- */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Contas pagas pelos investidores
            </h2>
            {lista.length > 0 && (
              <select
                className={`${inputCls} w-auto`}
                value={filtroInvestidor}
                onChange={(e) => setFiltroInvestidor(e.target.value)}
              >
                <option value="">Todos os investidores</option>
                {lista.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            )}
          </div>

          {contasPorInvestidor.length === 0 ? (
            <Vazio texto="Nenhuma conta paga por investidor ainda. Em Lançamentos, escolha quem pagou no campo 'Pago por'." />
          ) : (
            <Card className="mb-6 overflow-x-auto p-0">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Investidor</th>
                    <th className="px-4 py-3">Conta</th>
                    <th className="px-4 py-3">Etapa</th>
                    <th className="px-4 py-3 text-center">Compr.</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {contasPorInvestidor.map((l) => (
                    <tr key={l.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">
                        {dataBR(l.data_pagamento || l.data_emissao)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {nomeDe(l.investidor_id) || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-gray-900">{l.fornecedor || l.descricao || '—'}</p>
                        <p className="text-xs text-gray-500">
                          {l.nf_numero ? `NF ${l.nf_numero} · ` : ''}
                          {LABEL_CASA[l.casa]}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{l.etapas?.nome || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        {l.comprovante_url ? (
                          <a
                            href={l.comprovante_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-800"
                          >
                            <Paperclip className="mx-auto h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right font-semibold">{brl(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={5} className="px-4 py-3">
                      Total {filtroInvestidor ? `de ${nomeDe(filtroInvestidor)}` : 'geral'}
                    </td>
                    <td className="tnum px-4 py-3 text-right">
                      {brl(contasPorInvestidor.reduce((s, l) => s + Number(l.valor), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          )}

          {/* ---------- aportes em dinheiro ---------- */}
          <button
            onClick={() => setMostrarAportes(!mostrarAportes)}
            className="mb-2 flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
          >
            {mostrarAportes ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Aportes em dinheiro ao caixa comum ({aportes.length})
          </button>

          {mostrarAportes && (
            <Card className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <p className="text-xs text-gray-500">
                  Use só quando alguém coloca dinheiro no caixa sem ser para uma conta específica.
                </p>
                <button
                  className={btnPrimarioCls}
                  onClick={() => {
                    setForm({ ...FORM_VAZIO, investidor_id: lista[0]?.id || '' })
                    setModalAporte(true)
                  }}
                >
                  <Plus className="h-4 w-4" /> Novo aporte
                </button>
              </div>

              {aportes.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum aporte em dinheiro registrado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Investidor</th>
                        <th className="px-4 py-3">Forma</th>
                        <th className="px-4 py-3">Observação</th>
                        <th className="px-4 py-3 text-center">Compr.</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {aportes.map((a) => (
                        <tr key={a.id} className="border-b border-gray-100 last:border-0">
                          <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{dataBR(a.data)}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-900">
                            {a.investidores?.nome || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">{a.forma || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-600">{a.observacao || '—'}</td>
                          <td className="px-4 py-2.5 text-center">
                            {a.comprovante_url ? (
                              <a
                                href={a.comprovante_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-600 hover:text-emerald-800"
                              >
                                <Paperclip className="mx-auto h-4 w-4" />
                              </a>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="tnum px-4 py-2.5 text-right font-semibold text-emerald-700">
                            + {brl(a.valor)}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => abrirEdicao(a)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => excluirAporte(a)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* ---------- modal aporte ---------- */}
      <Modal
        aberto={modalAporte}
        titulo={form.id ? 'Editar aporte' : 'Novo aporte em dinheiro'}
        onFechar={() => setModalAporte(false)}
        largura="max-w-lg"
      >
        {lista.length === 0 ? (
          <p className="py-4 text-sm text-gray-600">
            Cadastre um investidor primeiro (botão <strong>Novo investidor</strong> no topo).
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Investidor" className="sm:col-span-2">
                <select
                  className={inputCls}
                  value={form.investidor_id}
                  onChange={(e) => setForm({ ...form, investidor_id: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {lista.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Data">
                <input
                  type="date"
                  className={inputCls}
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                />
              </Campo>
              <Campo label="Valor (R$)">
                <InputMoeda
                  className="font-semibold"
                  valor={form.valor}
                  onChange={(v) => setForm({ ...form, valor: v })}
                />
              </Campo>
              <Campo label="Forma">
                <input
                  className={inputCls}
                  value={form.forma}
                  onChange={(e) => setForm({ ...form, forma: e.target.value })}
                  placeholder="Pix, transferência..."
                />
              </Campo>
              <Campo label="Observação">
                <input
                  className={inputCls}
                  value={form.observacao}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                />
              </Campo>
            </div>
            <div className="mt-3">
              <Anexo
                label="Comprovante do aporte"
                pasta="aportes"
                url={form.comprovante_url}
                onChange={(u) => setForm({ ...form, comprovante_url: u })}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className={btnCls} onClick={() => setModalAporte(false)}>
                Cancelar
              </button>
              <button className={btnPrimarioCls} onClick={salvarAporte} disabled={salvando}>
                <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar aporte'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ---------- modal investidor ---------- */}
      <Modal
        aberto={modalInvestidor}
        titulo="Novo investidor"
        onFechar={() => setModalInvestidor(false)}
        largura="max-w-md"
      >
        <div className="grid gap-3">
          <Campo label="Nome">
            <input
              className={inputCls}
              value={novoInvestidor.nome}
              onChange={(e) => setNovoInvestidor({ ...novoInvestidor, nome: e.target.value })}
            />
          </Campo>
          <Campo label="Observação (opcional)">
            <input
              className={inputCls}
              value={novoInvestidor.observacao}
              onChange={(e) => setNovoInvestidor({ ...novoInvestidor, observacao: e.target.value })}
            />
          </Campo>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            className={btnPrimarioCls}
            onClick={criarInvestidor}
            disabled={salvando || !novoInvestidor.nome.trim()}
          >
            <Save className="h-4 w-4" /> Salvar
          </button>
        </div>
      </Modal>
    </>
  )
}
