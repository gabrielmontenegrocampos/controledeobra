'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  FileCode,
  File as FileIcon,
  Download,
  Trash2,
  Pencil,
  Save,
  Upload,
  Loader2,
  Search,
  ExternalLink,
  List,
  LayoutGrid,
} from 'lucide-react'
import { supabase, enviarArquivo, removerArquivo, mensagemErro } from '@/lib/supabase'
import { dataBR, hoje, tamanhoArquivo, LABEL_CATEGORIA } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import type { Arquivo, CategoriaArquivo } from '@/lib/types'
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

const LIMITE_MB = 50

function iconeDe(nome: string, tipo: string | null) {
  const ext = nome.split('.').pop()?.toLowerCase() || ''
  if (tipo?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext))
    return FileImage
  if (ext === 'pdf') return FileText
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return FileSpreadsheet
  if (['xml', 'dwg', 'dxf', 'json'].includes(ext)) return FileCode
  if (['doc', 'docx', 'txt', 'odt'].includes(ext)) return FileText
  return FileIcon
}

function semExtensao(nome: string) {
  const i = nome.lastIndexOf('.')
  return i > 0 ? nome.slice(0, i) : nome
}

export default function ArquivosPage() {
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')

  const [modal, setModal] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [selecionados, setSelecionados] = useState<File[]>([])
  const [novo, setNovo] = useState({
    categoria: 'projeto' as CategoriaArquivo,
    descricao: '',
    data_referencia: hoje(),
  })

  const [edicao, setEdicao] = useState<Arquivo | null>(null)
  const [visao, setVisao] = useState<'lista' | 'cards'>('lista')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('arquivos')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setErro(mensagemErro(error))
    else setArquivos((data as Arquivo[]) || [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return arquivos.filter((a) => {
      if (filtroCategoria && a.categoria !== filtroCategoria) return false
      if (b && !`${a.nome} ${a.descricao || ''}`.toLowerCase().includes(b)) return false
      return true
    })
  }, [arquivos, busca, filtroCategoria])

  const espacoTotal = arquivos.reduce((s, a) => s + Number(a.tamanho || 0), 0)
  const porCategoria = useMemo(() => {
    const m = new Map<string, number>()
    arquivos.forEach((a) => m.set(a.categoria, (m.get(a.categoria) || 0) + 1))
    return m
  }, [arquivos])

  async function enviar() {
    if (selecionados.length === 0) return
    const grandes = selecionados.filter((f) => f.size > LIMITE_MB * 1024 * 1024)
    if (grandes.length) {
      return setErro(
        `${grandes.map((f) => f.name).join(', ')} — acima do limite de ${LIMITE_MB} MB por arquivo.`
      )
    }

    setEnviando(true)
    setErro(null)

    try {
      for (let i = 0; i < selecionados.length; i++) {
        const file = selecionados[i]
        setProgresso(`Enviando ${i + 1} de ${selecionados.length}: ${file.name}`)
        const url = await enviarArquivo(file, `biblioteca/${novo.categoria}`)
        const { error } = await supabase.from('arquivos').insert({
          nome: semExtensao(file.name),
          categoria: novo.categoria,
          descricao: novo.descricao.trim() || null,
          url,
          tipo_arquivo: file.type || null,
          tamanho: file.size,
          data_referencia: novo.data_referencia || null,
        })
        if (error) throw new Error(mensagemErro(error))
      }
      setSelecionados([])
      setNovo({ ...novo, descricao: '' })
      setModal(false)
      carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha no envio.')
    } finally {
      setEnviando(false)
      setProgresso('')
    }
  }

  async function salvarEdicao() {
    if (!edicao) return
    const { error } = await supabase
      .from('arquivos')
      .update({
        nome: edicao.nome.trim(),
        categoria: edicao.categoria,
        descricao: edicao.descricao?.trim() || null,
        data_referencia: edicao.data_referencia || null,
      })
      .eq('id', edicao.id)
    if (error) return setErro(mensagemErro(error))
    setEdicao(null)
    carregar()
  }

  async function excluir(a: Arquivo) {
    if (!confirm(`Excluir "${a.nome}"? O arquivo também será apagado do armazenamento.`)) return
    const { error } = await supabase.from('arquivos').delete().eq('id', a.id)
    if (error) return setErro(mensagemErro(error))
    try {
      await removerArquivo(a.url)
    } catch {
      // o registro ja saiu da lista; o arquivo orfao nao atrapalha
    }
    carregar()
  }

  // ---------- relatorios ----------
  const colunas = ['Nome', 'Categoria', 'Descrição', 'Data de referência', 'Tamanho', 'Enviado em', 'Link']
  const linhas = filtrados.map((a) => [
    a.nome,
    LABEL_CATEGORIA[a.categoria],
    a.descricao || '—',
    a.data_referencia ? dataBR(a.data_referencia) : '—',
    tamanhoArquivo(a.tamanho),
    dataBR(a.created_at),
    a.url,
  ])

  function gerarPDF() {
    exportarPDF({
      titulo: 'Biblioteca de Arquivos da Obra',
      subtitulo: `${filtrados.length} arquivo(s)`,
      colunas: colunas.slice(0, 6),
      linhas: linhas.map((l) => l.slice(0, 6)),
      resumo: [
        { rotulo: 'Arquivos', valor: String(arquivos.length) },
        { rotulo: 'Espaço usado', valor: tamanhoArquivo(espacoTotal) },
        { rotulo: 'Categorias', valor: String(porCategoria.size) },
      ],
      alinharDireita: [4],
      paisagem: true,
      arquivo: 'biblioteca-arquivos',
    })
  }

  function gerarXLSX() {
    exportarXLSX('biblioteca-arquivos', [{ nome: 'Arquivos', colunas, linhas }])
  }

  return (
    <>
      <TituloSecao
        titulo="Arquivos da Obra"
        descricao="Projetos, contratos, alvarás, ARTs e tudo que precisa ficar à mão."
      >
        <div className="flex overflow-hidden rounded-lg border border-gray-300">
          <button
            type="button"
            onClick={() => setVisao('lista')}
            title="Ver em lista"
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
              visao === 'lista'
                ? 'bg-[#1f3a5f] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <List className="h-4 w-4" /> Lista
          </button>
          <button
            type="button"
            onClick={() => setVisao('cards')}
            title="Ver em cartões"
            className={`flex items-center gap-1.5 border-l border-gray-300 px-3 py-2 text-sm font-medium transition ${
              visao === 'cards'
                ? 'bg-[#1f3a5f] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutGrid className="h-4 w-4" /> Cartões
          </button>
        </div>
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
        <BotaoNovo onClick={() => setModal(true)}>Enviar arquivos</BotaoNovo>
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat rotulo="Arquivos guardados" valor={String(arquivos.length)} tom="destaque" />
        <Stat rotulo="Espaço usado" valor={tamanhoArquivo(espacoTotal)} />
        <Stat rotulo="Categorias em uso" valor={String(porCategoria.size)} />
      </div>

      {/* filtros */}
      <Card className="no-print mb-4">
        <Campo label="Buscar arquivo">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="Nome ou descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </Campo>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setFiltroCategoria('')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filtroCategoria === ''
                ? 'bg-[#1f3a5f] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todas ({arquivos.length})
          </button>
          {Object.entries(LABEL_CATEGORIA).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setFiltroCategoria(filtroCategoria === k ? '' : k)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filtroCategoria === k
                  ? 'bg-[#1f3a5f] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {v} ({porCategoria.get(k) || 0})
            </button>
          ))}
        </div>
      </Card>

      {carregando ? (
        <Carregando />
      ) : filtrados.length === 0 ? (
        <Vazio
          texto={
            arquivos.length === 0
              ? 'Nenhum arquivo ainda. Clique em "Enviar arquivos" para subir os projetos e contratos.'
              : 'Nenhum arquivo encontrado com esse filtro.'
          }
        />
      ) : visao === 'lista' ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Arquivo</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-right">Tamanho</th>
                <th className="px-4 py-3">Referência</th>
                <th className="px-4 py-3">Enviado em</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((a) => {
                const Icone = iconeDe(a.nome, a.tipo_arquivo)
                return (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5">
                      <div className="flex items-start gap-2">
                        <Icone className="mt-0.5 h-4 w-4 shrink-0 text-[#1f3a5f]" />
                        <div className="min-w-0">
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate font-medium text-gray-900 hover:text-[#1f3a5f] hover:underline"
                            title={a.nome}
                          >
                            {a.nome}
                          </a>
                          {a.descricao && (
                            <p className="truncate text-xs text-gray-500" title={a.descricao}>
                              {a.descricao}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tom="azul">{LABEL_CATEGORIA[a.categoria]}</Badge>
                    </td>
                    <td className="tnum px-4 py-2.5 text-right text-gray-600">
                      {tamanhoArquivo(a.tamanho)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {a.data_referencia ? dataBR(a.data_referencia) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{dataBR(a.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-0.5">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                          title="Abrir"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <a
                          href={a.url}
                          download
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                          title="Baixar"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => setEdicao(a)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => excluir(a)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 text-xs font-medium text-gray-600">
                <td colSpan={2} className="px-4 py-2.5">
                  {filtrados.length} arquivo(s)
                </td>
                <td className="tnum px-4 py-2.5 text-right">
                  {tamanhoArquivo(filtrados.reduce((soma, a) => soma + Number(a.tamanho || 0), 0))}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((a) => {
            const Icone = iconeDe(a.nome, a.tipo_arquivo)
            return (
              <Card key={a.id} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-[#1f3a5f]/10 p-2 text-[#1f3a5f]">
                    <Icone className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900" title={a.nome}>
                      {a.nome}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tom="azul">{LABEL_CATEGORIA[a.categoria]}</Badge>
                      <span className="text-[11px] text-gray-500">{tamanhoArquivo(a.tamanho)}</span>
                    </div>
                  </div>
                </div>

                {a.descricao && (
                  <p className="mt-2 line-clamp-2 text-xs text-gray-600" title={a.descricao}>
                    {a.descricao}
                  </p>
                )}

                <p className="mt-2 text-[11px] text-gray-400">
                  {a.data_referencia ? `Referência: ${dataBR(a.data_referencia)} · ` : ''}
                  Enviado em {dataBR(a.created_at)}
                </p>

                <div className="mt-3 flex items-center gap-1 border-t border-gray-100 pt-2">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[#1f3a5f] hover:bg-gray-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                  </a>
                  <a
                    href={a.url}
                    download
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Baixar
                  </a>
                  <button
                    onClick={() => setEdicao(a)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => excluir(a)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ---------- modal de envio ---------- */}
      <Modal
        aberto={modal}
        titulo="Enviar arquivos"
        onFechar={() => !enviando && setModal(false)}
        largura="max-w-xl"
      >
        <div className="grid gap-3">
          <Campo label="Categoria" dica="Vale para todos os arquivos deste envio">
            <select
              className={inputCls}
              value={novo.categoria}
              onChange={(e) => setNovo({ ...novo, categoria: e.target.value as CategoriaArquivo })}
            >
              {Object.entries(LABEL_CATEGORIA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Descrição (opcional)">
            <input
              className={inputCls}
              value={novo.descricao}
              onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
              placeholder="Ex.: Projeto estrutural aprovado — prancha 03"
            />
          </Campo>

          <Campo label="Data de referência" dica="Data do documento, não do envio">
            <input
              type="date"
              className={inputCls}
              value={novo.data_referencia}
              onChange={(e) => setNovo({ ...novo, data_referencia: e.target.value })}
            />
          </Campo>

          <div>
            <span className="mb-1 block text-xs font-medium text-gray-600">Arquivos</span>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-6 text-sm text-gray-600 hover:border-[#1f3a5f] hover:bg-gray-100">
              <Upload className="h-5 w-5" />
              Escolher arquivos (pode selecionar vários)
              <span className="text-[11px] text-gray-400">PDF, imagens, planilhas — até {LIMITE_MB} MB cada</span>
              <input
                type="file"
                multiple
                className="hidden"
                disabled={enviando}
                onChange={(e) => setSelecionados(Array.from(e.target.files || []))}
              />
            </label>

            {selecionados.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                {selecionados.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-gray-700">{f.name}</span>
                    <span className="shrink-0 text-gray-400">{tamanhoArquivo(f.size)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {progresso && (
            <p className="flex items-center gap-2 text-xs text-gray-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progresso}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className={btnCls} onClick={() => setModal(false)} disabled={enviando}>
            Cancelar
          </button>
          <button className={btnPrimarioCls} onClick={enviar} disabled={enviando || selecionados.length === 0}>
            <Upload className="h-4 w-4" />
            {enviando ? 'Enviando...' : `Enviar ${selecionados.length || ''}`}
          </button>
        </div>
      </Modal>

      {/* ---------- modal de edicao ---------- */}
      <Modal aberto={!!edicao} titulo="Editar arquivo" onFechar={() => setEdicao(null)} largura="max-w-lg">
        {edicao && (
          <>
            <div className="grid gap-3">
              <Campo label="Nome">
                <input
                  className={inputCls}
                  value={edicao.nome}
                  onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                />
              </Campo>
              <Campo label="Categoria">
                <select
                  className={inputCls}
                  value={edicao.categoria}
                  onChange={(e) => setEdicao({ ...edicao, categoria: e.target.value as CategoriaArquivo })}
                >
                  {Object.entries(LABEL_CATEGORIA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Descrição">
                <input
                  className={inputCls}
                  value={edicao.descricao || ''}
                  onChange={(e) => setEdicao({ ...edicao, descricao: e.target.value })}
                />
              </Campo>
              <Campo label="Data de referência">
                <input
                  type="date"
                  className={inputCls}
                  value={edicao.data_referencia || ''}
                  onChange={(e) => setEdicao({ ...edicao, data_referencia: e.target.value })}
                />
              </Campo>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className={btnCls} onClick={() => setEdicao(null)}>
                Cancelar
              </button>
              <button className={btnPrimarioCls} onClick={salvarEdicao}>
                <Save className="h-4 w-4" /> Salvar
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
