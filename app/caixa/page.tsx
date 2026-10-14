'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, Save, Paperclip, UserPlus, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { brl, dataBR, hoje, num, parseMoeda, pct } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import type { Aporte, CaixaResumo, Investidor, InvestidorResumo, Lancamento } from '@/lib/types'
import { Anexo } from '@/components/anexo'
import {
  AvisoConfig,
  Barra,
  BotaoNovo,
  BotoesRelatorio,
  Campo,
  Card,
  Carregando,
  Erro,
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
  const [saidas, setSaidas] = useState<Lancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [modalAporte, setModalAporte] = useState(false)
  const [modalInvestidor, setModalInvestidor] = useState(false)
  const [form, setForm] = useState<FormAporte>(FORM_VAZIO)
  const [novoInvestidor, setNovoInvestidor] = useState({ nome: '', observacao: '' })

  const carregar = useCallback(async () => {
    const [r, inv, lis, ap, sa] = await Promise.all([
      supabase.from('v_caixa_resumo').select('*').single(),
      supabase.from('v_investidores_resumo').select('*').order('total_aportado', { ascending: false }),
      supabase.from('investidores').select('*').order('nome'),
      supabase.from('aportes').select('*, investidores(nome)').order('data', { ascending: false }),
      supabase
        .from('lancamentos')
        .select('*, etapas(nome)')
        .eq('status', 'pago')
        .order('data_pagamento', { ascending: false }),
    ])
    if (r.error) setErro(r.error.message)
    else setResumo(r.data as CaixaResumo)
    if (inv.data) setInvestidores(inv.data as InvestidorResumo[])
    if (lis.data) setLista(lis.data as Investidor[])
    if (ap.data) setAportes(ap.data as Aporte[])
    if (sa.data) setSaidas(sa.data as Lancamento[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

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
    if (error) return setErro(error.message)
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
    if (error) return setErro(error.message)
    setNovoInvestidor({ nome: '', observacao: '' })
    setModalInvestidor(false)
    carregar()
  }

  async function excluirAporte(a: Aporte) {
    if (!confirm(`Excluir o aporte de ${brl(a.valor)} de ${a.investidores?.nome}?`)) return
    const { error } = await supabase.from('aportes').delete().eq('id', a.id)
    if (error) setErro(error.message)
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

  // extrato unificado: entradas (aportes) + saidas (lancamentos pagos)
  const extrato = useMemo(() => {
    const entradas = aportes.map((a) => ({
      id: `a-${a.id}`,
      data: a.data,
      tipo: 'entrada' as const,
      descricao: `Aporte — ${a.investidores?.nome || 'investidor'}`,
      detalhe: a.forma || '',
      valor: Number(a.valor),
      comprovante: a.comprovante_url,
    }))
    const saidasMap = saidas.map((l) => ({
      id: `l-${l.id}`,
      data: l.data_pagamento || l.data_emissao,
      tipo: 'saida' as const,
      descricao: l.fornecedor || l.descricao || 'Pagamento',
      detalhe: l.etapas?.nome || '',
      valor: Number(l.valor),
      comprovante: l.comprovante_url,
    }))
    const todas = [...entradas, ...saidasMap].sort((a, b) => (a.data < b.data ? 1 : -1))
    // saldo acumulado, calculado do mais antigo para o mais novo
    type Mov = (typeof todas)[number] & { saldo: number }
    const cronologico = [...todas].reverse().reduce<Mov[]>((acc, m) => {
      const anterior = acc.length > 0 ? acc[acc.length - 1].saldo : 0
      const saldo = anterior + (m.tipo === 'entrada' ? m.valor : -m.valor)
      return [...acc, { ...m, saldo }]
    }, [])
    return [...cronologico].reverse()
  }, [aportes, saidas])

  const totalAportado = Number(resumo?.total_aportado || 0)

  // ---------- relatorios ----------
  const colInv = ['Investidor', 'Aportes', 'Total aportado', 'Participação', 'Último aporte']
  const linInv = investidores.map((i) => [
    i.nome,
    String(i.qtd_aportes),
    brl(i.total_aportado),
    pct(i.perc_participacao),
    i.ultimo_aporte ? dataBR(i.ultimo_aporte) : '—',
  ])

  const colExt = ['Data', 'Movimento', 'Descrição', 'Detalhe', 'Valor', 'Saldo']
  const linExt = extrato.map((m) => [
    dataBR(m.data),
    m.tipo === 'entrada' ? 'Entrada' : 'Saída',
    m.descricao,
    m.detalhe,
    `${m.tipo === 'entrada' ? '+' : '-'} ${brl(m.valor)}`,
    brl(m.saldo),
  ])

  function gerarPDF() {
    exportarPDF({
      titulo: 'Caixa da Obra — Investidores e Extrato',
      colunas: colInv,
      linhas: linInv,
      resumo: [
        { rotulo: 'Total aportado', valor: brl(totalAportado) },
        { rotulo: 'Total pago', valor: brl(resumo?.total_pago) },
        { rotulo: 'Saldo em caixa', valor: brl(resumo?.saldo) },
        { rotulo: 'A pagar', valor: brl(resumo?.total_a_pagar) },
      ],
      alinharDireita: [1, 2, 3],
      arquivo: 'caixa-investidores',
    })
  }

  function gerarXLSX() {
    exportarXLSX('caixa-investidores', [
      { nome: 'Investidores', colunas: colInv, linhas: linInv },
      { nome: 'Extrato', colunas: colExt, linhas: linExt },
    ])
  }

  return (
    <>
      <TituloSecao titulo="Caixa" descricao="Quanto cada investidor aportou, saldo disponível e extrato da obra.">
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
        <button className={btnCls} onClick={() => setModalInvestidor(true)}>
          <UserPlus className="h-4 w-4" /> Investidor
        </button>
        <BotaoNovo
          onClick={() => {
            setForm({ ...FORM_VAZIO, investidor_id: lista[0]?.id || '' })
            setModalAporte(true)
          }}
        >
          Novo aporte
        </BotaoNovo>
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat rotulo="Total aportado" valor={brl(totalAportado)} tom="positivo" detalhe={`${investidores.length} investidor(es)`} />
        <Stat rotulo="Total pago" valor={brl(resumo?.total_pago)} />
        <Stat
          rotulo="Saldo em caixa"
          valor={brl(resumo?.saldo)}
          tom={Number(resumo?.saldo) < 0 ? 'negativo' : 'destaque'}
        />
        <Stat
          rotulo="Compromissos a pagar"
          valor={brl(resumo?.total_a_pagar)}
          tom={Number(resumo?.total_a_pagar) > Number(resumo?.saldo) ? 'negativo' : 'neutro'}
          detalhe={
            Number(resumo?.total_a_pagar) > Number(resumo?.saldo)
              ? 'maior que o saldo disponível'
              : undefined
          }
        />
      </div>

      {carregando ? (
        <Carregando />
      ) : (
        <>
          {/* investidores */}
          <h2 className="mb-2 mt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Investidores</h2>
          {investidores.length === 0 ? (
            <Vazio texto="Nenhum investidor cadastrado. Clique em 'Investidor' para criar o primeiro." />
          ) : (
            <Card className="mb-6 overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Investidor</th>
                    <th className="px-4 py-3 text-right">Total aportado</th>
                    <th className="px-4 py-3">Participação</th>
                    <th className="px-4 py-3 text-center">Aportes</th>
                    <th className="px-4 py-3">Último aporte</th>
                  </tr>
                </thead>
                <tbody>
                  {investidores.map((i) => (
                    <tr key={i.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{i.nome}</td>
                      <td className="tnum px-4 py-2.5 text-right font-semibold">{brl(i.total_aportado)}</td>
                      <td className="px-4 py-2.5">
                        <Barra valor={Number(i.total_aportado)} max={totalAportado} cor="#b8893b" />
                        <span className="tnum mt-1 block text-[11px] text-gray-500">{pct(i.perc_participacao)}</span>
                      </td>
                      <td className="tnum px-4 py-2.5 text-center">{i.qtd_aportes}</td>
                      <td className="px-4 py-2.5 text-gray-600">{i.ultimo_aporte ? dataBR(i.ultimo_aporte) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3">Total</td>
                    <td className="tnum px-4 py-3 text-right">{brl(totalAportado)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </Card>
          )}

          {/* aportes */}
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Aportes registrados</h2>
          {aportes.length === 0 ? (
            <Vazio texto="Nenhum aporte registrado ainda." />
          ) : (
            <Card className="mb-6 overflow-x-auto p-0">
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
                    <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{dataBR(a.data)}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{a.investidores?.nome || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{a.forma || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{a.observacao || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        {a.comprovante_url ? (
                          <a href={a.comprovante_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-800">
                            <Paperclip className="mx-auto h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right font-semibold text-emerald-700">+ {brl(a.valor)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => abrirEdicao(a)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => excluirAporte(a)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* extrato */}
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Extrato do caixa (entradas e saídas)
          </h2>
          {extrato.length === 0 ? (
            <Vazio texto="Sem movimentações." />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3 text-right">Entrada</th>
                    <th className="px-4 py-3 text-right">Saída</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {extrato.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 text-gray-700">{dataBR(m.data)}</td>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-1.5 font-medium text-gray-900">
                          {m.tipo === 'entrada' ? (
                            <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ArrowDownCircle className="h-4 w-4 text-red-500" />
                          )}
                          {m.descricao}
                        </span>
                        {m.detalhe && <span className="ml-6 text-xs text-gray-500">{m.detalhe}</span>}
                      </td>
                      <td className="tnum px-4 py-2 text-right text-emerald-700">
                        {m.tipo === 'entrada' ? brl(m.valor) : ''}
                      </td>
                      <td className="tnum px-4 py-2 text-right text-red-600">
                        {m.tipo === 'saida' ? brl(m.valor) : ''}
                      </td>
                      <td className={`tnum px-4 py-2 text-right font-semibold ${m.saldo < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {brl(m.saldo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* modal aporte */}
      <Modal
        aberto={modalAporte}
        titulo={form.id ? 'Editar aporte' : 'Novo aporte'}
        onFechar={() => setModalAporte(false)}
        largura="max-w-lg"
      >
        {lista.length === 0 ? (
          <p className="py-4 text-sm text-gray-600">
            Cadastre um investidor primeiro (botão <strong>Investidor</strong> no topo).
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Investidor" className="sm:col-span-2">
                <select className={inputCls} value={form.investidor_id} onChange={(e) => setForm({ ...form, investidor_id: e.target.value })}>
                  <option value="">Selecione...</option>
                  {lista.map((i) => (
                    <option key={i.id} value={i.id}>{i.nome}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Data">
                <input type="date" className={inputCls} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </Campo>
              <Campo label="Valor (R$)">
                <input className={`${inputCls} tnum text-right font-semibold`} value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
              </Campo>
              <Campo label="Forma">
                <input className={inputCls} value={form.forma} onChange={(e) => setForm({ ...form, forma: e.target.value })} placeholder="Pix, transferência..." />
              </Campo>
              <Campo label="Observação">
                <input className={inputCls} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
              </Campo>
            </div>
            <div className="mt-3">
              <Anexo label="Comprovante do aporte" pasta="aportes" url={form.comprovante_url} onChange={(u) => setForm({ ...form, comprovante_url: u })} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className={btnCls} onClick={() => setModalAporte(false)}>Cancelar</button>
              <button className={btnPrimarioCls} onClick={salvarAporte} disabled={salvando}>
                <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar aporte'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* modal investidor */}
      <Modal aberto={modalInvestidor} titulo="Novo investidor" onFechar={() => setModalInvestidor(false)} largura="max-w-md">
        <div className="grid gap-3">
          <Campo label="Nome">
            <input className={inputCls} value={novoInvestidor.nome} onChange={(e) => setNovoInvestidor({ ...novoInvestidor, nome: e.target.value })} />
          </Campo>
          <Campo label="Observação (opcional)">
            <input className={inputCls} value={novoInvestidor.observacao} onChange={(e) => setNovoInvestidor({ ...novoInvestidor, observacao: e.target.value })} />
          </Campo>
        </div>
        <div className="mt-5 flex justify-end">
          <button className={btnPrimarioCls} onClick={criarInvestidor} disabled={salvando || !novoInvestidor.nome.trim()}>
            <Save className="h-4 w-4" /> Salvar
          </button>
        </div>
      </Modal>
    </>
  )
}
