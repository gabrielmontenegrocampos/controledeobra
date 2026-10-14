'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Pencil, Trash2, Save, Plus, Paperclip, FileText, FileCode, Upload, Loader2, X,
  CalendarClock, Layers, ChevronDown, ChevronRight,
} from 'lucide-react'
import { supabase, enviarArquivo, mensagemErro } from '@/lib/supabase'
import { lerNFe } from '@/lib/nfe'
import { comDescendentes, nomeCompleto } from '@/lib/etapas'
import { garantirFornecedor } from '@/lib/fornecedores'
import { gerarParcelas, somarMeses, valorParcela } from '@/lib/parcelas'
import { brl, dataBR, hoje, num, numEnxuto, parseMoeda, LABEL_CASA, LABEL_TIPO } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import type {
  Casa, Etapa, Fornecedor, Investidor, Lancamento, ParcelamentoResumo,
  StatusLancamento, TipoLancamento,
} from '@/lib/types'
import { Anexo } from '@/components/anexo'
import {
  AvisoConfig,
  Badge,
  BotaoNovo,
  BotoesRelatorio,
  Campo,
  Card,
  Carregando,
  Barra,
  Erro,
  InputDigitos,
  InputMoeda,
  InputQuantidade,
  Modal,
  Stat,
  TituloSecao,
  Vazio,
  btnCls,
  btnPrimarioCls,
  inputCls,
} from '@/components/ui'

type ItemForm = { material: string; unidade: string; quantidade: string; valor_unit: string }

type Form = {
  id?: string
  tipo: TipoLancamento
  etapa_id: string
  casa: Casa
  fornecedor: string
  descricao: string
  nf_numero: string
  data_emissao: string
  data_pagamento: string
  data_vencimento: string
  valor: string
  valorAuto: boolean
  status: StatusLancamento
  forma_pagamento: string
  investidor_id: string
  nf_url: string | null
  comprovante_url: string | null
  itens: ItemForm[]
}

const FORM_VAZIO: Form = {
  tipo: 'material',
  etapa_id: '',
  casa: 'comum',
  fornecedor: '',
  descricao: '',
  nf_numero: '',
  data_emissao: hoje(),
  data_pagamento: hoje(),
  data_vencimento: hoje(),
  valor: '',
  valorAuto: true,
  status: 'pago',
  forma_pagamento: 'Pix',
  investidor_id: '',
  nf_url: null,
  comprovante_url: null,
  itens: [],
}

const ITEM_VAZIO: ItemForm = { material: '', unidade: 'un', quantidade: '1', valor_unit: '' }

type FormParcela = {
  descricao: string
  fornecedor: string
  etapa_id: string
  casa: Casa
  tipo: TipoLancamento
  investidor_id: string
  valor_total: string
  valor_entrada: string
  entrada_paga: boolean
  data_entrada: string
  qtd_parcelas: string
  primeiro_vencimento: string
  observacao: string
}

const PARCELA_VAZIA: FormParcela = {
  descricao: '',
  fornecedor: '',
  etapa_id: '',
  casa: 'comum',
  tipo: 'outro',
  investidor_id: '',
  valor_total: '',
  valor_entrada: '',
  entrada_paga: true,
  data_entrada: hoje(),
  qtd_parcelas: '12',
  primeiro_vencimento: somarMeses(hoje(), 1),
  observacao: '',
}

export default function LancamentosPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [investidores, setInvestidores] = useState<Investidor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<Form>(FORM_VAZIO)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [avisoXML, setAvisoXML] = useState<{ tom: 'ok' | 'alerta' | 'erro'; texto: string } | null>(null)
  const [cnpjXML, setCnpjXML] = useState<string | null>(null)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [parcelamentos, setParcelamentos] = useState<ParcelamentoResumo[]>([])
  const [mostrarParcelas, setMostrarParcelas] = useState(true)
  const [modalParcela, setModalParcela] = useState(false)
  const [formParcela, setFormParcela] = useState(PARCELA_VAZIA)

  const [filtros, setFiltros] = useState({
    tipo: '',
    etapa_id: '',
    casa: '',
    status: '',
    investidor_id: '',
    parcelamento_id: '',
    busca: '',
    de: '',
    ate: '',
  })

  const carregar = useCallback(async () => {
    const [lanc, et, inv, forn, parc] = await Promise.all([
      supabase
        .from('lancamentos')
        .select('*, etapas(nome), itens_lancamento(*)')
        .order('data_emissao', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('etapas').select('*').order('ordem'),
      supabase.from('investidores').select('*').order('nome'),
      supabase.from('fornecedores').select('*').order('nome'),
      supabase.from('v_parcelamentos_resumo').select('*').order('primeira_parcela'),
    ])
    if (lanc.error) setErro(mensagemErro(lanc.error))
    else setLancamentos((lanc.data as Lancamento[]) || [])
    if (et.data) setEtapas(et.data as Etapa[])
    if (inv.data) setInvestidores(inv.data as Investidor[])
    if (forn.data) setFornecedores(forn.data as Fornecedor[])
    if (parc.data) setParcelamentos(parc.data as ParcelamentoResumo[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // lista de etapas para os selects, com as subetapas indentadas
  const opcoesEtapas = useMemo(() => {
    const raizes = etapas.filter((e) => !e.etapa_pai_id)
    return raizes.flatMap((r) => [
      { id: r.id, rotulo: r.nome },
      ...etapas
        .filter((f) => f.etapa_pai_id === r.id)
        .map((f) => ({ id: f.id, rotulo: `\u00a0\u00a0\u00a0\u203a ${f.nome}` })),
    ])
  }, [etapas])

  // ---------- filtros ----------
  const filtrados = useMemo(() => {
    const b = filtros.busca.trim().toLowerCase()
    const idsEtapa =
      filtros.etapa_id && filtros.etapa_id !== 'sem_etapa'
        ? comDescendentes(etapas, filtros.etapa_id)
        : null
    return lancamentos.filter((l) => {
      if (filtros.tipo && l.tipo !== filtros.tipo) return false
      if (filtros.etapa_id === 'sem_etapa' && l.etapa_id) return false
      if (idsEtapa && (!l.etapa_id || !idsEtapa.includes(l.etapa_id))) return false
      if (filtros.casa && l.casa !== filtros.casa) return false
      if (filtros.status && l.status !== filtros.status) return false
      if (filtros.investidor_id && l.investidor_id !== filtros.investidor_id) return false
      if (filtros.parcelamento_id && l.parcelamento_id !== filtros.parcelamento_id) return false
      if (filtros.de && l.data_emissao < filtros.de) return false
      if (filtros.ate && l.data_emissao > filtros.ate) return false
      if (b) {
        const alvo = [
          l.fornecedor,
          l.descricao,
          l.nf_numero,
          l.etapas?.nome,
          ...(l.itens_lancamento || []).map((i) => i.material),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!alvo.includes(b)) return false
      }
      return true
    })
  }, [lancamentos, filtros, etapas])

  const total = filtrados.reduce((s, l) => s + Number(l.valor), 0)
  const pago = filtrados.filter((l) => l.status === 'pago').reduce((s, l) => s + Number(l.valor), 0)
  const aPagar = total - pago
  const semComprovante = filtrados.filter((l) => l.status === 'pago' && !l.comprovante_url).length

  // ---------- form ----------
  const totalItens = form.itens.reduce(
    (s, i) => s + (Number(i.quantidade.replace(',', '.')) || 0) * parseMoeda(i.valor_unit),
    0
  )

  function abrirNovo() {
    setForm({ ...FORM_VAZIO, etapa_id: etapas[0]?.id || '' })
    setAvisoXML(null)
    setCnpjXML(null)
    setModal(true)
  }

  function abrirEdicao(l: Lancamento) {
    setAvisoXML(null)
    setCnpjXML(null)
    setForm({
      id: l.id,
      valorAuto: false,
      tipo: l.tipo,
      etapa_id: l.etapa_id || '',
      casa: l.casa,
      fornecedor: l.fornecedor || '',
      descricao: l.descricao || '',
      nf_numero: l.nf_numero || '',
      data_emissao: l.data_emissao,
      data_pagamento: l.data_pagamento || '',
      data_vencimento: l.data_vencimento || l.data_emissao,
      valor: num(l.valor),
      status: l.status,
      forma_pagamento: l.forma_pagamento || '',
      investidor_id: l.investidor_id || '',
      nf_url: l.nf_url,
      comprovante_url: l.comprovante_url,
      itens: (l.itens_lancamento || []).map((i) => ({
        material: i.material,
        unidade: i.unidade || '',
        quantidade: String(i.quantidade),
        valor_unit: num(i.valor_unit),
      })),
    })
    setModal(true)
  }

  async function importarXML(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return

    setImportando(true)
    setAvisoXML(null)
    setErro(null)

    try {
      const nota = lerNFe(await file.text())
      setCnpjXML(nota.cnpj)

      const duplicada = lancamentos.find(
        (l) =>
          l.id !== form.id &&
          l.nf_numero &&
          nota.nf_numero &&
          l.nf_numero === nota.nf_numero &&
          (l.fornecedor || '').toLowerCase() === nota.fornecedor.toLowerCase()
      )

      // guarda o proprio XML como anexo da nota
      let nfUrl = form.nf_url
      try {
        nfUrl = await enviarArquivo(file, 'notas-xml')
      } catch {
        // se o upload falhar, segue mesmo assim com os dados preenchidos
      }

      setForm((f) => ({
        ...f,
        tipo: 'material',
        fornecedor: nota.fornecedor || f.fornecedor,
        nf_numero: nota.nf_numero || f.nf_numero,
        data_emissao: nota.data_emissao || f.data_emissao,
        valor: num(nota.valor_total),
        valorAuto: false,
        nf_url: nfUrl,
        itens: nota.itens.map((i) => ({
          material: i.material,
          unidade: i.unidade,
          quantidade: numEnxuto(i.quantidade, 3),
          valor_unit: numEnxuto(i.valor_unit, 4),
        })),
      }))

      const diferenca = Math.abs(nota.valor_total - nota.valor_itens)
      const partes = [
        `${nota.itens.length} item(ns) importado(s)${nota.fornecedor ? ` de ${nota.fornecedor}` : ''}.`,
      ]
      if (diferenca >= 0.01) {
        partes.push(
          `Total da nota ${brl(nota.valor_total)} contra ${brl(nota.valor_itens)} somando os itens — diferença de ${brl(diferenca)} (frete, impostos ou desconto). Deixei o total da nota.`
        )
      }
      if (duplicada) {
        partes.push(`Atenção: já existe um lançamento com a NF ${nota.nf_numero} desse fornecedor.`)
      }

      setAvisoXML({
        tom: duplicada || diferenca >= 0.01 ? 'alerta' : 'ok',
        texto: partes.join(' '),
      })
    } catch (e) {
      setAvisoXML({
        tom: 'erro',
        texto: e instanceof Error ? e.message : 'Não consegui ler o XML.',
      })
    } finally {
      setImportando(false)
      ev.target.value = ''
    }
  }

  async function salvar() {
    const valorFinal = form.valorAuto && form.itens.length > 0 ? totalItens : parseMoeda(form.valor)
    if (valorFinal <= 0) return setErro('Informe um valor maior que zero (ou adicione itens).')
    if (!form.data_emissao) return setErro('Informe a data.')

    setSalvando(true)
    setErro(null)

    const fornecedorId = form.fornecedor.trim()
      ? await garantirFornecedor(form.fornecedor, cnpjXML)
      : null

    const payload = {
      etapa_id: form.etapa_id || null,
      fornecedor_id: fornecedorId,
      data_vencimento:
        form.status === 'a_pagar'
          ? form.data_vencimento || form.data_emissao
          : form.data_pagamento || form.data_emissao,
      tipo: form.tipo,
      casa: form.casa,
      fornecedor: form.fornecedor.trim() || null,
      descricao: form.descricao.trim() || null,
      nf_numero: form.nf_numero.trim() || null,
      data_emissao: form.data_emissao,
      data_pagamento: form.status === 'pago' ? form.data_pagamento || form.data_emissao : null,
      valor: valorFinal,
      status: form.status,
      forma_pagamento: form.forma_pagamento.trim() || null,
      investidor_id: form.investidor_id || null,
      nf_url: form.nf_url,
      comprovante_url: form.comprovante_url,
    }

    let lancamentoId = form.id

    if (form.id) {
      const { error } = await supabase.from('lancamentos').update(payload).eq('id', form.id)
      if (error) {
        setSalvando(false)
        return setErro(mensagemErro(error))
      }
      await supabase.from('itens_lancamento').delete().eq('lancamento_id', form.id)
    } else {
      const { data, error } = await supabase.from('lancamentos').insert(payload).select('id').single()
      if (error) {
        setSalvando(false)
        return setErro(mensagemErro(error))
      }
      lancamentoId = data.id
    }

    const itens = form.itens
      .filter((i) => i.material.trim())
      .map((i) => ({
        lancamento_id: lancamentoId,
        material: i.material.trim(),
        unidade: i.unidade.trim() || null,
        quantidade: Number(i.quantidade.replace(',', '.')) || 0,
        valor_unit: parseMoeda(i.valor_unit),
      }))

    if (itens.length) {
      const { error } = await supabase.from('itens_lancamento').insert(itens)
      if (error) {
        setSalvando(false)
        return setErro(mensagemErro(error))
      }
    }

    setSalvando(false)
    setModal(false)
    setForm(FORM_VAZIO)
    carregar()
  }

  async function salvarParcelamento() {
    const total = parseMoeda(formParcela.valor_total)
    const entrada = parseMoeda(formParcela.valor_entrada)
    const qtd = Number(formParcela.qtd_parcelas) || 0

    if (!formParcela.descricao.trim()) return setErro('Descreva a compra. Ex.: Lote 12 — quadra 4.')
    if (total <= 0) return setErro('Informe o valor total da compra.')
    if (entrada > total) return setErro('A entrada não pode ser maior que o valor total.')
    if (qtd < 1 || qtd > 240) return setErro('A quantidade de parcelas deve ficar entre 1 e 240.')

    setSalvando(true)
    setErro(null)

    const fornecedorId = formParcela.fornecedor.trim()
      ? await garantirFornecedor(formParcela.fornecedor)
      : null

    const parcelas = gerarParcelas({
      valorTotal: total,
      entrada,
      quantidade: qtd,
      primeiroVencimento: formParcela.primeiro_vencimento,
    })

    const { data: cabecalho, error: erroCabecalho } = await supabase
      .from('parcelamentos')
      .insert({
        descricao: formParcela.descricao.trim(),
        fornecedor: formParcela.fornecedor.trim() || null,
        fornecedor_id: fornecedorId,
        etapa_id: formParcela.etapa_id || null,
        casa: formParcela.casa,
        tipo: formParcela.tipo,
        valor_total: total,
        valor_entrada: entrada,
        qtd_parcelas: qtd,
        valor_parcela: parcelas[0]?.valor || 0,
        primeira_parcela: formParcela.primeiro_vencimento,
        observacao: formParcela.observacao.trim() || null,
      })
      .select('id')
      .single()

    if (erroCabecalho) {
      setSalvando(false)
      return setErro(mensagemErro(erroCabecalho))
    }

    const base = {
      etapa_id: formParcela.etapa_id || null,
      tipo: formParcela.tipo,
      casa: formParcela.casa,
      fornecedor: formParcela.fornecedor.trim() || null,
      fornecedor_id: fornecedorId,
      parcelamento_id: cabecalho.id,
    }

    const linhas: Record<string, unknown>[] = []

    if (entrada > 0) {
      linhas.push({
        ...base,
        descricao: `${formParcela.descricao.trim()} — entrada`,
        data_emissao: formParcela.data_entrada,
        data_vencimento: formParcela.data_entrada,
        data_pagamento: formParcela.entrada_paga ? formParcela.data_entrada : null,
        valor: entrada,
        status: formParcela.entrada_paga ? 'pago' : 'a_pagar',
        investidor_id: formParcela.investidor_id || null,
      })
    }

    parcelas.forEach((parcela) => {
      linhas.push({
        ...base,
        descricao: `${formParcela.descricao.trim()} — parcela ${parcela.numero}/${qtd}`,
        data_emissao: parcela.vencimento,
        data_vencimento: parcela.vencimento,
        data_pagamento: null,
        valor: parcela.valor,
        status: 'a_pagar',
        parcela_num: parcela.numero,
        parcela_total: qtd,
      })
    })

    const { error } = await supabase.from('lancamentos').insert(linhas)
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))

    setFormParcela(PARCELA_VAZIA)
    setModalParcela(false)
    carregar()
  }

  async function excluirParcelamento(p: ParcelamentoResumo) {
    const aviso =
      Number(p.parcelas_pagas) > 0
        ? `"${p.descricao}" já tem ${p.parcelas_pagas} parcela(s) paga(s). Excluir apaga TODAS as parcelas e a entrada. Continuar?`
        : `Excluir "${p.descricao}" e todas as suas parcelas?`
    if (!confirm(aviso)) return
    const { error } = await supabase.from('parcelamentos').delete().eq('id', p.id)
    if (error) setErro(mensagemErro(error))
    else carregar()
  }

  async function excluir(l: Lancamento) {
    if (!confirm(`Excluir o lançamento de ${brl(l.valor)}${l.fornecedor ? ` — ${l.fornecedor}` : ''}?`)) return
    const { error } = await supabase.from('lancamentos').delete().eq('id', l.id)
    if (error) setErro(mensagemErro(error))
    else carregar()
  }

  // ---------- relatorios ----------
  const colunas = ['Data', 'Tipo', 'Etapa', 'Casa', 'Pago por', 'Fornecedor', 'NF', 'Descrição', 'Status', 'Valor']
  const linhas = filtrados.map((l) => [
    dataBR(l.data_emissao),
    LABEL_TIPO[l.tipo],
    nomeCompleto(etapas, l.etapa_id) || '—',
    LABEL_CASA[l.casa],
    investidores.find((i) => i.id === l.investidor_id)?.nome || '—',
    l.fornecedor || '—',
    l.nf_numero || '—',
    l.descricao || '—',
    l.status === 'pago' ? 'Pago' : 'A pagar',
    brl(l.valor),
  ])

  function gerarPDF() {
    exportarPDF({
      titulo: 'Relatório de Lançamentos',
      subtitulo: `${filtrados.length} lançamento(s)`,
      colunas,
      linhas,
      resumo: [
        { rotulo: 'Total', valor: brl(total) },
        { rotulo: 'Pago', valor: brl(pago) },
        { rotulo: 'A pagar', valor: brl(aPagar) },
        { rotulo: 'Lançamentos', valor: String(filtrados.length) },
      ],
      alinharDireita: [9],
      paisagem: true,
      arquivo: 'lancamentos',
    })
  }

  function gerarXLSX() {
    const itensLinhas = filtrados.flatMap((l) =>
      (l.itens_lancamento || []).map((i) => [
        dataBR(l.data_emissao),
        l.fornecedor || '—',
        l.nf_numero || '—',
        i.material,
        i.unidade || '—',
        Number(i.quantidade),
        Number(i.valor_unit),
        Number(i.quantidade) * Number(i.valor_unit),
      ])
    )
    exportarXLSX('lancamentos', [
      { nome: 'Lançamentos', colunas, linhas },
      {
        nome: 'Itens das notas',
        colunas: ['Data', 'Fornecedor', 'NF', 'Material', 'Un', 'Qtd', 'Valor unit.', 'Total'],
        linhas: itensLinhas,
      },
    ])
  }

  return (
    <>
      <TituloSecao
        titulo="Lançamentos"
        descricao="Notas fiscais de material, mão de obra, serviços e taxas — com NF e comprovante anexados."
      >
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
        <button
          className={btnCls}
          onClick={() => {
            setFormParcela({ ...PARCELA_VAZIA, etapa_id: etapas[0]?.id || '' })
            setModalParcela(true)
          }}
        >
          <Layers className="h-4 w-4" /> Compra parcelada
        </button>
        <BotaoNovo onClick={abrirNovo}>Novo lançamento</BotaoNovo>
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat rotulo="Total filtrado" valor={brl(total)} tom="destaque" detalhe={`${filtrados.length} lançamento(s)`} />
        <Stat rotulo="Pago" valor={brl(pago)} />
        <Stat rotulo="A pagar" valor={brl(aPagar)} tom={aPagar > 0 ? 'negativo' : 'neutro'} />
        <Stat
          rotulo="Sem comprovante"
          valor={String(semComprovante)}
          tom={semComprovante > 0 ? 'negativo' : 'positivo'}
          detalhe="pagamentos marcados como pagos"
        />
      </div>

      {/* compras parceladas */}
      {parcelamentos.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setMostrarParcelas(!mostrarParcelas)}
            className="mb-2 flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
          >
            {mostrarParcelas ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Compras parceladas ({parcelamentos.length})
          </button>

          {mostrarParcelas && (
            <div className="grid gap-3 lg:grid-cols-2">
              {parcelamentos.map((p) => {
                const pagas = Number(p.parcelas_pagas)
                const total = Number(p.qtd_parcelas)
                const atrasada =
                  p.proximo_vencimento && p.proximo_vencimento < hoje() ? true : false
                return (
                  <Card key={p.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{p.descricao}</p>
                        <p className="text-xs text-gray-500">
                          {p.fornecedor || 'sem fornecedor'} ·{' '}
                          {Number(p.valor_entrada) > 0
                            ? `entrada de ${brl(p.valor_entrada)} + `
                            : ''}
                          {total}x de {brl(p.valor_parcela)}
                        </p>
                      </div>
                      <button
                        onClick={() => excluirParcelamento(p)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Excluir parcelamento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-gray-600">
                        <span>
                          {pagas} de {total} parcelas pagas
                        </span>
                        <span className="tnum">
                          {brl(p.valor_pago)} de {brl(p.valor_total)}
                        </span>
                      </div>
                      <Barra valor={Number(p.valor_pago)} max={Number(p.valor_total) || 1} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`flex items-center gap-1 text-xs ${
                          atrasada ? 'font-medium text-red-600' : 'text-gray-600'
                        }`}
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        {p.proximo_vencimento
                          ? `${atrasada ? 'Vencida em' : 'Próxima em'} ${dataBR(p.proximo_vencimento)}`
                          : 'Tudo pago'}
                      </span>
                      <button
                        onClick={() =>
                          setFiltros({
                            ...filtros,
                            parcelamento_id: filtros.parcelamento_id === p.id ? '' : p.id,
                          })
                        }
                        className="text-xs font-medium text-[#1f3a5f] underline"
                      >
                        {filtros.parcelamento_id === p.id ? 'mostrar tudo' : 'ver parcelas'}
                      </button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* filtros */}
      <Card className="no-print mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Buscar">
            <input
              className={inputCls}
              placeholder="Fornecedor, NF, material..."
              value={filtros.busca}
              onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
            />
          </Campo>
          <Campo label="Tipo">
            <select className={inputCls} value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(LABEL_TIPO).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Etapa">
            <select className={inputCls} value={filtros.etapa_id} onChange={(e) => setFiltros({ ...filtros, etapa_id: e.target.value })}>
              <option value="">Todas</option>
              <option value="sem_etapa">— Sem etapa —</option>
              {opcoesEtapas.map((e) => (
                <option key={e.id} value={e.id}>{e.rotulo}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Casa">
            <select className={inputCls} value={filtros.casa} onChange={(e) => setFiltros({ ...filtros, casa: e.target.value })}>
              <option value="">Todas</option>
              {Object.entries(LABEL_CASA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Status">
            <select className={inputCls} value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
              <option value="">Todos</option>
              <option value="pago">Pago</option>
              <option value="a_pagar">A pagar</option>
            </select>
          </Campo>
          <Campo label="Pago por">
            <select
              className={inputCls}
              value={filtros.investidor_id}
              onChange={(e) => setFiltros({ ...filtros, investidor_id: e.target.value })}
            >
              <option value="">Todos</option>
              {investidores.map((i) => (
                <option key={i.id} value={i.id}>{i.nome}</option>
              ))}
            </select>
          </Campo>
          <Campo label="De">
            <input type="date" className={inputCls} value={filtros.de} onChange={(e) => setFiltros({ ...filtros, de: e.target.value })} />
          </Campo>
          <Campo label="Até">
            <input type="date" className={inputCls} value={filtros.ate} onChange={(e) => setFiltros({ ...filtros, ate: e.target.value })} />
          </Campo>
          <div className="flex items-end">
            <button
              className={btnCls}
              onClick={() =>
                setFiltros({
                  tipo: '',
                  etapa_id: '',
                  casa: '',
                  status: '',
                  investidor_id: '',
                  parcelamento_id: '',
                  busca: '',
                  de: '',
                  ate: '',
                })
              }
            >
              <X className="h-4 w-4" /> Limpar filtros
            </button>
          </div>
        </div>
      </Card>

      {carregando ? (
        <Carregando />
      ) : filtrados.length === 0 ? (
        <Vazio texto="Nenhum lançamento encontrado." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Tipo / Etapa</th>
                <th className="px-4 py-3">Fornecedor / Descrição</th>
                <th className="px-4 py-3">Casa</th>
                <th className="px-4 py-3">Pago por</th>
                <th className="px-4 py-3 text-center">Anexos</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((l) => (
                <Fragment key={l.id}>
                  <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">
                      {dataBR(l.data_emissao)}
                      {l.status === 'a_pagar' && l.data_vencimento && (
                        <span
                          className={`block text-[11px] ${
                            l.data_vencimento < hoje() ? 'font-medium text-red-600' : 'text-amber-700'
                          }`}
                        >
                          vence {dataBR(l.data_vencimento)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{LABEL_TIPO[l.tipo]}</p>
                      <p className="text-xs text-gray-500">
                        {nomeCompleto(etapas, l.etapa_id) || 'sem etapa'}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{l.fornecedor || '—'}</p>
                      <p className="text-xs text-gray-500">
                        {l.nf_numero && <span className="mr-2">NF {l.nf_numero}</span>}
                        {l.descricao}
                      </p>
                      {l.parcela_num ? (
                        <span className="mt-1 inline-block">
                          <Badge tom="azul">
                            parcela {l.parcela_num}/{l.parcela_total}
                          </Badge>
                        </span>
                      ) : null}
                      {(l.itens_lancamento?.length || 0) > 0 && (
                        <button
                          onClick={() => setExpandido(expandido === l.id ? null : l.id)}
                          className="mt-1 text-[11px] font-medium text-[#1f3a5f] underline"
                        >
                          {expandido === l.id ? 'ocultar' : `ver ${l.itens_lancamento!.length} item(ns)`}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tom={l.casa === 'comum' ? 'cinza' : 'azul'}>{LABEL_CASA[l.casa]}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {l.investidor_id ? (
                        <span className="font-medium text-gray-800">
                          {investidores.find((i) => i.id === l.investidor_id)?.nome || '—'}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-2">
                        {l.nf_url && (
                          <a href={l.nf_url} target="_blank" rel="noopener noreferrer" title="Nota fiscal" className="text-gray-500 hover:text-[#1f3a5f]">
                            <FileText className="h-4 w-4" />
                          </a>
                        )}
                        {l.comprovante_url && (
                          <a href={l.comprovante_url} target="_blank" rel="noopener noreferrer" title="Comprovante" className="text-emerald-600 hover:text-emerald-800">
                            <Paperclip className="h-4 w-4" />
                          </a>
                        )}
                        {!l.nf_url && !l.comprovante_url && <span className="text-xs text-gray-300">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {l.status === 'pago' ? (
                        <Badge tom={l.comprovante_url ? 'verde' : 'amarelo'}>
                          {l.comprovante_url ? 'Pago' : 'Pago s/ compr.'}
                        </Badge>
                      ) : (
                        <Badge tom="vermelho">A pagar</Badge>
                      )}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right font-semibold text-gray-900">{brl(l.valor)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => abrirEdicao(l)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => excluir(l)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {expandido === l.id && (
                    <tr className="bg-gray-50/80">
                      <td colSpan={9} className="px-4 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-500">
                              <th className="py-1">Material</th>
                              <th className="py-1">Un</th>
                              <th className="py-1 text-right">Qtd</th>
                              <th className="py-1 text-right">Valor unit.</th>
                              <th className="py-1 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {l.itens_lancamento!.map((i, idx) => (
                              <tr key={i.id || idx} className="border-t border-gray-200">
                                <td className="py-1 font-medium text-gray-800">{i.material}</td>
                                <td className="py-1 text-gray-600">{i.unidade || '—'}</td>
                                <td className="tnum py-1 text-right">{num(i.quantidade, 2)}</td>
                                <td className="tnum py-1 text-right">{brl(i.valor_unit)}</td>
                                <td className="tnum py-1 text-right font-medium">
                                  {brl(Number(i.quantidade) * Number(i.valor_unit))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={7} className="px-4 py-3">Total filtrado</td>
                <td className="tnum px-4 py-3 text-right">{brl(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      {/* ---------- modal ---------- */}
      <Modal
        aberto={modal}
        titulo={form.id ? 'Editar lançamento' : 'Novo lançamento'}
        onFechar={() => setModal(false)}
        largura="max-w-3xl"
      >
        {/* importar XML da NF-e */}
        <div className="mb-4 rounded-lg border border-dashed border-[#1f3a5f]/40 bg-[#1f3a5f]/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-[#1f3a5f]">
                <FileCode className="h-4 w-4" /> Importar XML da NF-e
              </p>
              <p className="text-[11px] text-gray-600">
                Preenche fornecedor, número, data, valor e todos os itens de uma vez.
              </p>
            </div>
            <label className={`${btnCls} cursor-pointer`}>
              {importando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Lendo...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Escolher XML
                </>
              )}
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                className="hidden"
                disabled={importando}
                onChange={importarXML}
              />
            </label>
          </div>
          {avisoXML && (
            <p
              className={`mt-2 text-xs ${
                avisoXML.tom === 'erro'
                  ? 'text-red-600'
                  : avisoXML.tom === 'alerta'
                    ? 'text-amber-700'
                    : 'text-emerald-700'
              }`}
            >
              {avisoXML.texto}
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Tipo">
            <select className={inputCls} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoLancamento })}>
              {Object.entries(LABEL_TIPO).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Etapa">
            <select className={inputCls} value={form.etapa_id} onChange={(e) => setForm({ ...form, etapa_id: e.target.value })}>
              <option value="">Sem etapa</option>
              {opcoesEtapas.map((e) => (
                <option key={e.id} value={e.id}>{e.rotulo}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Casa" dica="Comum é rateado 50/50">
            <select className={inputCls} value={form.casa} onChange={(e) => setForm({ ...form, casa: e.target.value as Casa })}>
              {Object.entries(LABEL_CASA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Fornecedor / Prestador" className="sm:col-span-2">
            <>
              <input
                className={inputCls}
                list="lista-fornecedores"
                value={form.fornecedor}
                onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                placeholder="Ex.: Depósito Lagoa Materiais"
              />
              <datalist id="lista-fornecedores">
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.nome} />
                ))}
              </datalist>
            </>
          </Campo>
          <Campo label="Nº da nota fiscal">
            <InputDigitos
              valor={form.nf_numero}
              onChange={(v) => setForm({ ...form, nf_numero: v })}
              placeholder="Ex.: 12345"
              max={20}
            />
          </Campo>

          <Campo label="Descrição" className="sm:col-span-3">
            <input className={inputCls} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Cimento e areia para contrapiso / Diária de 2 serventes" />
          </Campo>

          <Campo label="Data da nota / serviço">
            <input type="date" className={inputCls} value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} />
          </Campo>
          <Campo label="Status">
            <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as StatusLancamento })}>
              <option value="pago">Pago</option>
              <option value="a_pagar">A pagar</option>
            </select>
          </Campo>
          {form.status === 'pago' ? (
            <Campo label="Data do pagamento">
              <input
                type="date"
                className={inputCls}
                value={form.data_pagamento}
                onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })}
              />
            </Campo>
          ) : (
            <Campo label="Vencimento">
              <input
                type="date"
                className={inputCls}
                value={form.data_vencimento}
                onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
              />
            </Campo>
          )}

          <Campo label="Forma de pagamento">
            <input className={inputCls} value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} placeholder="Pix, transferência, dinheiro..." />
          </Campo>
          <Campo label="Pago por" dica="Qual investidor bancou esta conta">
            <select
              className={inputCls}
              value={form.investidor_id}
              onChange={(e) => setForm({ ...form, investidor_id: e.target.value })}
            >
              <option value="">Caixa da obra / não definido</option>
              {investidores.map((i) => (
                <option key={i.id} value={i.id}>{i.nome}</option>
              ))}
            </select>
          </Campo>

          <Campo
            label="Valor total (R$)"
            dica={
              form.itens.length > 0
                ? form.valorAuto
                  ? 'Somando os itens abaixo'
                  : `Soma dos itens: ${brl(totalItens)}`
                : undefined
            }
          >
            <div className="flex items-center gap-2">
              <InputMoeda
                className={`text-base font-semibold ${
                  form.valorAuto && form.itens.length > 0 ? 'bg-gray-100' : ''
                }`}
                valor={form.valorAuto && form.itens.length > 0 ? num(totalItens) : form.valor}
                readOnly={form.valorAuto && form.itens.length > 0}
                onChange={(v) => setForm({ ...form, valor: v })}
              />
              {form.itens.length > 0 && (
                <button
                  type="button"
                  className="shrink-0 whitespace-nowrap text-[11px] font-medium text-[#1f3a5f] underline"
                  onClick={() =>
                    setForm({
                      ...form,
                      valorAuto: !form.valorAuto,
                      valor: form.valorAuto ? num(totalItens) : form.valor,
                    })
                  }
                >
                  {form.valorAuto ? 'editar' : 'usar soma'}
                </button>
              )}
            </div>
          </Campo>
        </div>

        {/* itens da nota */}
        <div className="mt-5 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-gray-800">Itens da nota</p>
              <p className="text-[11px] text-gray-500">
                Preencha para controlar a entrada e a quantidade de cada material.
              </p>
            </div>
            <button type="button" className={btnCls} onClick={() => setForm({ ...form, itens: [...form.itens, { ...ITEM_VAZIO }] })}>
              <Plus className="h-4 w-4" /> Item
            </button>
          </div>

          {form.itens.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-gray-400">
              Nenhum item. Para mão de obra ou taxa, deixe vazio e informe só o valor total.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {form.itens.map((item, idx) => {
                const subtotal = (Number(item.quantidade.replace(',', '.')) || 0) * parseMoeda(item.valor_unit)
                return (
                  <div key={idx} className="grid grid-cols-12 items-end gap-2 px-3 py-2">
                    <div className="col-span-12 sm:col-span-5">
                      <input
                        className={inputCls}
                        placeholder="Material"
                        value={item.material}
                        onChange={(e) => {
                          const itens = [...form.itens]
                          itens[idx] = { ...item, material: e.target.value }
                          setForm({ ...form, itens })
                        }}
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <input
                        className={inputCls}
                        placeholder="un"
                        value={item.unidade}
                        onChange={(e) => {
                          const itens = [...form.itens]
                          itens[idx] = { ...item, unidade: e.target.value }
                          setForm({ ...form, itens })
                        }}
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <InputQuantidade
                        placeholder="Qtd"
                        valor={item.quantidade}
                        onChange={(v) => {
                          const itens = [...form.itens]
                          itens[idx] = { ...item, quantidade: v }
                          setForm({ ...form, itens })
                        }}
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-2">
                      <InputMoeda
                        casas={4}
                        placeholder="Valor unit."
                        valor={item.valor_unit}
                        onChange={(v) => {
                          const itens = [...form.itens]
                          itens[idx] = { ...item, valor_unit: v }
                          setForm({ ...form, itens })
                        }}
                      />
                    </div>
                    <div className="col-span-12 flex items-center justify-between sm:col-span-2 sm:justify-end sm:gap-2">
                      <span className="tnum text-sm font-medium text-gray-700">{brl(subtotal)}</span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, itens: form.itens.filter((_, i) => i !== idx) })}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-end gap-3 bg-gray-50 px-3 py-2 text-sm font-semibold">
                <span className="text-gray-600">Total dos itens</span>
                <span className="tnum">{brl(totalItens)}</span>
              </div>
            </div>
          )}
        </div>

        {/* anexos */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Anexo label="Nota fiscal" pasta="notas" url={form.nf_url} onChange={(u) => setForm({ ...form, nf_url: u })} />
          <Anexo label="Comprovante de pagamento" pasta="comprovantes" url={form.comprovante_url} onChange={(u) => setForm({ ...form, comprovante_url: u })} />
        </div>

        {form.status === 'pago' && !form.comprovante_url && (
          <p className="mt-2 text-xs text-amber-700">
            Está marcado como pago e ainda sem comprovante anexado.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button className={btnCls} onClick={() => setModal(false)}>Cancelar</button>
          <button className={btnPrimarioCls} onClick={salvar} disabled={salvando}>
            <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar lançamento'}
          </button>
        </div>
      </Modal>

      {/* ---------- modal de compra parcelada ---------- */}
      <Modal
        aberto={modalParcela}
        titulo="Compra parcelada"
        onFechar={() => setModalParcela(false)}
        largura="max-w-2xl"
      >
        <p className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Gera a entrada e todas as parcelas de uma vez. Cada parcela vira um lançamento a pagar
          com seu vencimento, então entra no orçamento, no caixa e nos relatórios como qualquer
          outra conta.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="O que foi comprado" className="sm:col-span-2">
            <input
              className={inputCls}
              value={formParcela.descricao}
              onChange={(e) => setFormParcela({ ...formParcela, descricao: e.target.value })}
              placeholder="Ex.: Lote 12 — quadra 4"
            />
          </Campo>
          <Campo label="Vendedor / Fornecedor">
            <input
              className={inputCls}
              list="lista-fornecedores"
              value={formParcela.fornecedor}
              onChange={(e) => setFormParcela({ ...formParcela, fornecedor: e.target.value })}
              placeholder="Nome de quem vendeu"
            />
          </Campo>

          <Campo label="Tipo">
            <select
              className={inputCls}
              value={formParcela.tipo}
              onChange={(e) =>
                setFormParcela({ ...formParcela, tipo: e.target.value as TipoLancamento })
              }
            >
              {Object.entries(LABEL_TIPO).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Etapa">
            <select
              className={inputCls}
              value={formParcela.etapa_id}
              onChange={(e) => setFormParcela({ ...formParcela, etapa_id: e.target.value })}
            >
              <option value="">Sem etapa</option>
              {opcoesEtapas.map((e) => (
                <option key={e.id} value={e.id}>{e.rotulo}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Casa">
            <select
              className={inputCls}
              value={formParcela.casa}
              onChange={(e) => setFormParcela({ ...formParcela, casa: e.target.value as Casa })}
            >
              {Object.entries(LABEL_CASA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Valor total da compra (R$)">
            <InputMoeda
              className="font-semibold"
              valor={formParcela.valor_total}
              onChange={(v) => setFormParcela({ ...formParcela, valor_total: v })}
            />
          </Campo>
          <Campo label="Entrada (R$)" dica="Deixe zerado se não teve entrada">
            <InputMoeda
              valor={formParcela.valor_entrada}
              onChange={(v) => setFormParcela({ ...formParcela, valor_entrada: v })}
            />
          </Campo>
          <Campo label="Data da entrada">
            <input
              type="date"
              className={inputCls}
              value={formParcela.data_entrada}
              onChange={(e) => setFormParcela({ ...formParcela, data_entrada: e.target.value })}
            />
          </Campo>

          {parseMoeda(formParcela.valor_entrada) > 0 && (
            <>
              <Campo label="A entrada já foi paga?" className="sm:col-span-1">
                <select
                  className={inputCls}
                  value={formParcela.entrada_paga ? 'sim' : 'nao'}
                  onChange={(e) =>
                    setFormParcela({ ...formParcela, entrada_paga: e.target.value === 'sim' })
                  }
                >
                  <option value="sim">Sim, já paguei</option>
                  <option value="nao">Ainda não</option>
                </select>
              </Campo>
              <Campo label="Entrada paga por" className="sm:col-span-2">
                <select
                  className={inputCls}
                  value={formParcela.investidor_id}
                  onChange={(e) =>
                    setFormParcela({ ...formParcela, investidor_id: e.target.value })
                  }
                >
                  <option value="">Caixa da obra / não definido</option>
                  {investidores.map((i) => (
                    <option key={i.id} value={i.id}>{i.nome}</option>
                  ))}
                </select>
              </Campo>
            </>
          )}

          <Campo label="Quantidade de parcelas">
            <InputDigitos
              className="tnum text-right"
              valor={formParcela.qtd_parcelas}
              onChange={(v) => setFormParcela({ ...formParcela, qtd_parcelas: v })}
              max={3}
              placeholder="12"
            />
          </Campo>
          <Campo label="Vencimento da 1ª parcela" className="sm:col-span-2">
            <input
              type="date"
              className={inputCls}
              value={formParcela.primeiro_vencimento}
              onChange={(e) =>
                setFormParcela({ ...formParcela, primeiro_vencimento: e.target.value })
              }
            />
          </Campo>

          <Campo label="Observação" className="sm:col-span-3">
            <input
              className={inputCls}
              value={formParcela.observacao}
              onChange={(e) => setFormParcela({ ...formParcela, observacao: e.target.value })}
              placeholder="Contrato, cartório, condições..."
            />
          </Campo>
        </div>

        {/* previa do que vai ser gerado */}
        <div className="mt-4 rounded-lg border border-[#1f3a5f]/20 bg-[#1f3a5f]/5 p-3">
          {(() => {
            const total = parseMoeda(formParcela.valor_total)
            const entrada = parseMoeda(formParcela.valor_entrada)
            const qtd = Number(formParcela.qtd_parcelas) || 0
            const lista = gerarParcelas({
              valorTotal: total,
              entrada,
              quantidade: qtd,
              primeiroVencimento: formParcela.primeiro_vencimento,
            })
            if (lista.length === 0) {
              return (
                <p className="text-xs text-gray-500">
                  Preencha o valor total e a quantidade de parcelas para ver a prévia.
                </p>
              )
            }
            const cheia = valorParcela(total, entrada, qtd)
            const ultima = lista[lista.length - 1]
            const ajuste = Math.abs(ultima.valor - cheia) >= 0.01
            return (
              <>
                <p className="text-sm font-medium text-[#1f3a5f]">
                  Vai gerar {entrada > 0 ? '1 entrada + ' : ''}
                  {lista.length} parcela(s) de {brl(cheia)}
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {entrada > 0 && (
                    <>
                      Entrada de {brl(entrada)} em {dataBR(formParcela.data_entrada)}
                      {formParcela.entrada_paga ? ' (já paga)' : ' (a pagar)'} ·{' '}
                    </>
                  )}
                  1ª em {dataBR(lista[0].vencimento)} · última em {dataBR(ultima.vencimento)}
                  {ajuste && ` · a última fica ${brl(ultima.valor)} para fechar a conta`}
                </p>
                <p className="tnum mt-1 text-xs text-gray-500">
                  Soma: {brl(entrada + lista.reduce((s, l) => s + l.valor, 0))} de {brl(total)}
                </p>
              </>
            )
          })()}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className={btnCls} onClick={() => setModalParcela(false)}>
            Cancelar
          </button>
          <button className={btnPrimarioCls} onClick={salvarParcelamento} disabled={salvando}>
            <Save className="h-4 w-4" /> {salvando ? 'Gerando...' : 'Gerar parcelas'}
          </button>
        </div>
      </Modal>
    </>
  )
}
