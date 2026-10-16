'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, Save, Search, Building2 } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { brl, dataBR, maskCNPJ, maskTelefone } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import type { FornecedorResumo } from '@/lib/types'
import {
  AvisoConfig,
  Badge,
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

type Form = {
  id?: string
  nome: string
  cnpj: string
  telefone: string
  email: string
  observacao: string
}

const FORM_VAZIO: Form = { nome: '', cnpj: '', telefone: '', email: '', observacao: '' }

export default function FornecedoresPage() {
  const [fornecedores, setFornecedores] = useState<FornecedorResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<Form>(FORM_VAZIO)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('v_fornecedores_resumo')
      .select('*')
      .order('total_comprado', { ascending: false })
    if (error) setErro(mensagemErro(error))
    else setFornecedores((data as FornecedorResumo[]) || [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase()
    if (!b) return fornecedores
    return fornecedores.filter((f) =>
      `${f.nome} ${f.cnpj || ''} ${f.telefone || ''} ${f.email || ''}`.toLowerCase().includes(b)
    )
  }, [fornecedores, busca])

  const totalComprado = fornecedores.reduce((s, f) => s + Number(f.total_comprado), 0)
  const totalAPagar = fornecedores.reduce((s, f) => s + Number(f.total_a_pagar), 0)

  async function salvar() {
    if (!form.nome.trim()) return
    setSalvando(true)
    setErro(null)
    const payload = {
      nome: form.nome.trim(),
      cnpj: form.cnpj.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      observacao: form.observacao.trim() || null,
    }
    const { error } = form.id
      ? await supabase.from('fornecedores').update(payload).eq('id', form.id)
      : await supabase.from('fornecedores').insert(payload)
    setSalvando(false)
    if (error) {
      return setErro(
        error.code === '23505'
          ? 'Já existe um fornecedor com esse nome ou CNPJ.'
          : mensagemErro(error)
      )
    }
    setForm(FORM_VAZIO)
    setModal(false)
    carregar()
  }

  async function excluir(f: FornecedorResumo) {
    if (Number(f.qtd_lancamentos) > 0) {
      return setErro(
        `${f.nome} tem ${f.qtd_lancamentos} lançamento(s) e não pode ser excluído. Edite o nome se quiser corrigi-lo.`
      )
    }
    if (!confirm(`Excluir o fornecedor "${f.nome}"?`)) return
    const { error } = await supabase.from('fornecedores').delete().eq('id', f.id)
    if (error) setErro(mensagemErro(error))
    else carregar()
  }

  function abrirEdicao(f: FornecedorResumo) {
    setForm({
      id: f.id,
      nome: f.nome,
      cnpj: f.cnpj || '',
      telefone: f.telefone || '',
      email: f.email || '',
      observacao: '',
    })
    setModal(true)
  }

  // ---------- relatorios ----------
  const colunas = ['Fornecedor', 'CNPJ', 'Telefone', 'E-mail', 'Lançamentos', 'Total comprado', 'Em aberto', 'Última compra']
  const linhas = filtrados.map((f) => [
    f.nome,
    f.cnpj || '—',
    f.telefone || '—',
    f.email || '—',
    String(f.qtd_lancamentos),
    brl(f.total_comprado),
    brl(f.total_a_pagar),
    f.ultima_compra ? dataBR(f.ultima_compra) : '—',
  ])

  function gerarPDF() {
    exportarPDF({
      titulo: 'Fornecedores da Obra',
      subtitulo: `${filtrados.length} fornecedor(es)`,
      colunas,
      linhas,
      resumo: [
        { rotulo: 'Fornecedores', valor: String(fornecedores.length) },
        { rotulo: 'Total comprado', valor: brl(totalComprado) },
        { rotulo: 'Em aberto', valor: brl(totalAPagar) },
      ],
      alinharDireita: [4, 5, 6],
      paisagem: true,
      arquivo: 'fornecedores',
    })
  }

  function gerarXLSX() {
    exportarXLSX('fornecedores', [{ nome: 'Fornecedores', colunas, linhas }])
  }

  return (
    <>
      <TituloSecao
        titulo="Fornecedores"
        descricao="A lista se completa sozinha: todo lançamento novo cadastra quem ainda não está aqui."
      >
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
        <BotaoNovo
          onClick={() => {
            setForm(FORM_VAZIO)
            setModal(true)
          }}
        >
          Novo fornecedor
        </BotaoNovo>
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat rotulo="Fornecedores" valor={String(fornecedores.length)} tom="destaque" />
        <Stat rotulo="Total comprado" valor={brl(totalComprado)} />
        <Stat
          rotulo="Em aberto"
          valor={brl(totalAPagar)}
          tom={totalAPagar > 0 ? 'negativo' : 'neutro'}
          detalhe="contas a pagar"
        />
      </div>

      <Card className="no-print mb-4">
        <Campo label="Buscar">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="Nome, CNPJ, telefone ou e-mail..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </Campo>
      </Card>

      {carregando ? (
        <Carregando />
      ) : filtrados.length === 0 ? (
        <Vazio
          texto={
            fornecedores.length === 0
              ? 'Nenhum fornecedor ainda. Eles aparecem aqui conforme você lança as notas — ou cadastre um agora.'
              : 'Nenhum fornecedor encontrado com essa busca.'
          }
        />
      ) : (
        <>
          {/* celular: cartao compacto */}
          <div className="space-y-2 md:hidden">
            {filtrados.map((f) => (
              <div key={f.id} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{f.nome}</p>
                    <p className="truncate text-[11px] text-gray-500">
                      {f.cnpj ? `${maskCNPJ(f.cnpj)} · ` : ''}
                      {f.qtd_lancamentos} lançamento(s)
                      {f.ultima_compra ? ` · ${dataBR(f.ultima_compra)}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-sm font-semibold text-gray-900">
                      {brl(f.total_comprado)}
                    </p>
                    {Number(f.total_a_pagar) > 0 && (
                      <p className="tnum text-[11px] font-medium text-amber-700">
                        {brl(f.total_a_pagar)} em aberto
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                  <span className="truncate text-[11px] text-gray-500">
                    {f.telefone ? maskTelefone(f.telefone) : f.email || ''}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => abrirEdicao(f)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 active:bg-gray-100"
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => excluir(f)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 active:bg-red-50 active:text-red-600"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <p className="flex items-center justify-between rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600">
              <span>{filtrados.length} fornecedor(es)</span>
              <span className="tnum">{brl(totalComprado)}</span>
            </p>
          </div>

        <Card className="hidden overflow-x-auto p-0 md:block">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3 text-center">Lançamentos</th>
                <th className="px-4 py-3 text-right">Total comprado</th>
                <th className="px-4 py-3 text-right">Em aberto</th>
                <th className="px-4 py-3">Última compra</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((f) => (
                <tr key={f.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                  <td data-rotulo="Fornecedor" className="px-4 py-2.5">
                    <p className="flex items-center gap-1.5 font-medium text-gray-900">
                      <Building2 className="h-3.5 w-3.5 text-gray-400" />
                      {f.nome}
                    </p>
                    {f.cnpj && <p className="tnum ml-5 text-xs text-gray-500">{maskCNPJ(f.cnpj)}</p>}
                  </td>
                  <td data-rotulo="Contato" className="px-4 py-2.5 text-xs text-gray-600">
                    {f.telefone && <p>{maskTelefone(f.telefone)}</p>}
                    {f.email && <p className="truncate">{f.email}</p>}
                    {!f.telefone && !f.email && <span className="text-gray-300">—</span>}
                  </td>
                  <td data-rotulo="Lançamentos" className="tnum px-4 py-2.5 text-center">
                    {Number(f.qtd_lancamentos) > 0 ? (
                      f.qtd_lancamentos
                    ) : (
                      <Badge tom="cinza">sem compras</Badge>
                    )}
                  </td>
                  <td data-rotulo="Total comprado" className="tnum px-4 py-2.5 text-right font-semibold">{brl(f.total_comprado)}</td>
                  <td data-rotulo="Em aberto" className="tnum px-4 py-2.5 text-right">
                    {Number(f.total_a_pagar) > 0 ? (
                      <span className="font-medium text-amber-700">{brl(f.total_a_pagar)}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td data-rotulo="Última compra" className="px-4 py-2.5 text-gray-600">
                    {f.ultima_compra ? dataBR(f.ultima_compra) : '—'}
                  </td>
                  <td className="acoes px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => abrirEdicao(f)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => excluir(f)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={3} className="px-4 py-3">
                  Total
                </td>
                <td className="tnum px-4 py-3 text-right">{brl(totalComprado)}</td>
                <td className="tnum px-4 py-3 text-right">{brl(totalAPagar)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </Card>
        </>
      )}

      <Modal
        aberto={modal}
        titulo={form.id ? 'Editar fornecedor' : 'Novo fornecedor'}
        onFechar={() => setModal(false)}
        largura="max-w-lg"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome" className="sm:col-span-2">
            <input
              className={inputCls}
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Depósito Lagoa Materiais"
            />
          </Campo>
          <Campo label="CNPJ">
            <input
              className={`${inputCls} tnum`}
              value={maskCNPJ(form.cnpj)}
              onChange={(e) => setForm({ ...form, cnpj: maskCNPJ(e.target.value) })}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
            />
          </Campo>
          <Campo label="Telefone">
            <input
              className={`${inputCls} tnum`}
              value={maskTelefone(form.telefone)}
              onChange={(e) => setForm({ ...form, telefone: maskTelefone(e.target.value) })}
              placeholder="(31) 99999-9999"
              inputMode="tel"
            />
          </Campo>
          <Campo label="E-mail" className="sm:col-span-2">
            <input
              type="email"
              className={inputCls}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="contato@fornecedor.com.br"
            />
          </Campo>
          <Campo label="Observação" className="sm:col-span-2">
            <input
              className={inputCls}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              placeholder="Prazo de entrega, condição de pagamento..."
            />
          </Campo>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className={btnCls} onClick={() => setModal(false)}>
            Cancelar
          </button>
          <button className={btnPrimarioCls} onClick={salvar} disabled={salvando || !form.nome.trim()}>
            <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>
    </>
  )
}
