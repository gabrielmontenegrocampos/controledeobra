'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileText,
  FileImage,
  FileSpreadsheet,
  FileCode,
  File as FileIcon,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderInput,
  CornerLeftUp,
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
  ChevronRight,
  Home,
} from 'lucide-react'
import { supabase, enviarArquivo, removerArquivo, mensagemErro } from '@/lib/supabase'
import { dataBR, hoje, tamanhoArquivo, LABEL_CATEGORIA } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import type { Arquivo, CategoriaArquivo, Pasta } from '@/lib/types'
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

type Arrastado = { tipo: 'arquivo' | 'pasta'; id: string; nome: string }

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

/** Da raiz ate a pasta, na ordem de leitura */
function caminhoDaPasta(pastas: Pasta[], id: string | null): Pasta[] {
  const mapa = new Map(pastas.map((p) => [p.id, p]))
  const caminho: Pasta[] = []
  let atual = id ? mapa.get(id) : undefined
  let guarda = 0
  while (atual && guarda++ < 20) {
    caminho.unshift(atual)
    atual = atual.pasta_pai_id ? mapa.get(atual.pasta_pai_id) : undefined
  }
  return caminho
}

function caminhoTexto(pastas: Pasta[], id: string | null) {
  const c = caminhoDaPasta(pastas, id)
  return c.length ? c.map((p) => p.nome).join(' / ') : 'Raiz'
}

/** A pasta e tudo dentro dela, para nao deixar mover uma pasta para dentro de si mesma */
function pastaComDescendentes(pastas: Pasta[], id: string): string[] {
  const resultado = [id]
  const fila = [id]
  let guarda = 0
  while (fila.length && guarda++ < 500) {
    const atual = fila.shift()!
    pastas
      .filter((p) => p.pasta_pai_id === atual)
      .forEach((f) => {
        resultado.push(f.id)
        fila.push(f.id)
      })
  }
  return resultado
}

export default function ArquivosPage() {
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [visao, setVisao] = useState<'lista' | 'cards'>('lista')
  const [pastaAtual, setPastaAtual] = useState<string | null>(null)

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
  const [pastaEmEdicao, setPastaEmEdicao] = useState<Pasta | null>(null)
  const [modalPasta, setModalPasta] = useState(false)
  const [nomePasta, setNomePasta] = useState('')
  const [aMover, setAMover] = useState<Arrastado | null>(null)

  const [arrastando, setArrastando] = useState<Arrastado | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const [arq, pas] = await Promise.all([
      supabase.from('arquivos').select('*').order('created_at', { ascending: false }),
      supabase.from('pastas').select('*').order('nome'),
    ])
    if (arq.error) setErro(mensagemErro(arq.error))
    else setArquivos((arq.data as Arquivo[]) || [])
    if (pas.data) setPastas(pas.data as Pasta[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const buscando = busca.trim() !== '' || filtroCategoria !== ''

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return arquivos.filter((a) => {
      if (filtroCategoria && a.categoria !== filtroCategoria) return false
      if (b && !`${a.nome} ${a.descricao || ''}`.toLowerCase().includes(b)) return false
      // com busca ou filtro ligado, procura em todas as pastas
      if (!buscando && (a.pasta_id || null) !== pastaAtual) return false
      return true
    })
  }, [arquivos, busca, filtroCategoria, buscando, pastaAtual])

  const subpastas = useMemo(
    () =>
      buscando
        ? []
        : pastas
            .filter((p) => (p.pasta_pai_id || null) === pastaAtual)
            .sort((a, b) => a.nome.localeCompare(b.nome)),
    [pastas, pastaAtual, buscando]
  )

  const caminho = caminhoDaPasta(pastas, pastaAtual)
  const pastaDeCima = caminho.length > 1 ? caminho[caminho.length - 2] : null

  const conteudoDaPasta = useCallback(
    (id: string) => {
      const dentro = pastaComDescendentes(pastas, id)
      const arqs = arquivos.filter((a) => a.pasta_id && dentro.includes(a.pasta_id))
      return {
        arquivos: arqs.length,
        subpastas: dentro.length - 1,
        tamanho: arqs.reduce((s, a) => s + Number(a.tamanho || 0), 0),
      }
    },
    [pastas, arquivos]
  )

  const espacoTotal = arquivos.reduce((s, a) => s + Number(a.tamanho || 0), 0)
  const porCategoria = useMemo(() => {
    const m = new Map<string, number>()
    arquivos.forEach((a) => m.set(a.categoria, (m.get(a.categoria) || 0) + 1))
    return m
  }, [arquivos])

  // opcoes de pasta para os seletores, com indentacao
  const opcoesPastas = useMemo(() => {
    const monta = (paiId: string | null, nivel: number): { id: string; rotulo: string }[] =>
      pastas
        .filter((p) => (p.pasta_pai_id || null) === paiId)
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .flatMap((p) => [
          {
            id: p.id,
            rotulo: `${'   '.repeat(nivel)}${nivel > 0 ? '› ' : ''}${p.nome}`,
          },
          ...monta(p.id, nivel + 1),
        ])
    return monta(null, 0)
  }, [pastas])

  // ---------------- pastas ----------------
  async function salvarPasta() {
    const nome = nomePasta.trim()
    if (!nome) return
    const { error } = pastaEmEdicao
      ? await supabase.from('pastas').update({ nome }).eq('id', pastaEmEdicao.id)
      : await supabase.from('pastas').insert({ nome, pasta_pai_id: pastaAtual })
    if (error) return setErro(mensagemErro(error))
    setNomePasta('')
    setPastaEmEdicao(null)
    setModalPasta(false)
    carregar()
  }

  async function excluirPasta(p: Pasta) {
    const dentro = conteudoDaPasta(p.id)
    const aviso =
      dentro.arquivos > 0 || dentro.subpastas > 0
        ? `"${p.nome}" tem ${dentro.subpastas} subpasta(s) e ${dentro.arquivos} arquivo(s). As subpastas somem e os arquivos voltam para a raiz — nenhum arquivo é apagado. Continuar?`
        : `Excluir a pasta "${p.nome}"?`
    if (!confirm(aviso)) return
    const { error } = await supabase.from('pastas').delete().eq('id', p.id)
    if (error) setErro(mensagemErro(error))
    else carregar()
  }

  /** Move arquivo ou pasta para dentro do destino (null = raiz) */
  async function moverPara(item: Arrastado, destino: string | null) {
    setAlvo(null)
    setArrastando(null)

    if (item.tipo === 'pasta') {
      if (destino === item.id) return
      if (destino && pastaComDescendentes(pastas, item.id).includes(destino)) {
        setAMover(null)
        return setErro(`Não dá para mover "${item.nome}" para dentro dela mesma.`)
      }
      const { error } = await supabase
        .from('pastas')
        .update({ pasta_pai_id: destino })
        .eq('id', item.id)
      if (error) return setErro(mensagemErro(error))
    } else {
      const { error } = await supabase
        .from('arquivos')
        .update({ pasta_id: destino })
        .eq('id', item.id)
      if (error) return setErro(mensagemErro(error))
    }
    setAMover(null)
    carregar()
  }

  // ---------------- arrastar e soltar ----------------
  function aoComecarArrasto(e: React.DragEvent, item: Arrastado) {
    e.dataTransfer.setData('text/plain', JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'move'
    setArrastando(item)
  }

  function aoSoltar(e: React.DragEvent, destino: string | null) {
    e.preventDefault()
    let item = arrastando
    try {
      const bruto = e.dataTransfer.getData('text/plain')
      if (bruto) item = JSON.parse(bruto) as Arrastado
    } catch {
      // mantem o que ficou no estado
    }
    if (item) moverPara(item, destino)
  }

  function propsDestino(destino: string | null, chave: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (arrastando?.tipo === 'pasta' && arrastando.id === destino) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move' as const
        setAlvo(chave)
      },
      onDragLeave: () => setAlvo((a) => (a === chave ? null : a)),
      onDrop: (e: React.DragEvent) => aoSoltar(e, destino),
    }
  }

  const realce = (chave: string) =>
    alvo === chave ? 'ring-2 ring-[#1f3a5f] ring-offset-1 bg-[#1f3a5f]/5' : ''

  // ---------------- arquivos ----------------
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
          pasta_id: pastaAtual,
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
        pasta_id: edicao.pasta_id,
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

  // ---------------- relatorios ----------------
  const colunas = ['Nome', 'Pasta', 'Categoria', 'Descrição', 'Referência', 'Tamanho', 'Enviado em']
  const linhaDe = (a: Arquivo) => [
    a.nome,
    caminhoTexto(pastas, a.pasta_id),
    LABEL_CATEGORIA[a.categoria],
    a.descricao || '—',
    a.data_referencia ? dataBR(a.data_referencia) : '—',
    tamanhoArquivo(a.tamanho),
    dataBR(a.created_at),
  ]
  const linhas = filtrados.map(linhaDe)

  function gerarPDF() {
    exportarPDF({
      titulo: 'Biblioteca de Arquivos da Obra',
      subtitulo: buscando
        ? `${filtrados.length} arquivo(s) encontrado(s)`
        : `Pasta: ${caminhoTexto(pastas, pastaAtual)}`,
      colunas,
      linhas,
      resumo: [
        { rotulo: 'Arquivos no total', valor: String(arquivos.length) },
        { rotulo: 'Pastas', valor: String(pastas.length) },
        { rotulo: 'Espaço usado', valor: tamanhoArquivo(espacoTotal) },
      ],
      alinharDireita: [5],
      paisagem: true,
      arquivo: 'biblioteca-arquivos',
    })
  }

  function gerarXLSX() {
    exportarXLSX('biblioteca-arquivos', [
      { nome: 'Pasta atual', colunas, linhas },
      { nome: 'Todos os arquivos', colunas, linhas: arquivos.map(linhaDe) },
    ])
  }

  return (
    <>
      <TituloSecao
        titulo="Arquivos da Obra"
        descricao="Projetos, contratos, alvarás e ARTs. Arraste o arquivo sobre a pasta para organizar."
      >
        <div className="flex overflow-hidden rounded-lg border border-gray-300">
          <button
            type="button"
            onClick={() => setVisao('lista')}
            title="Ver em lista"
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
              visao === 'lista' ? 'bg-[#1f3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <List className="h-4 w-4" /> Lista
          </button>
          <button
            type="button"
            onClick={() => setVisao('cards')}
            title="Ver em cartões"
            className={`flex items-center gap-1.5 border-l border-gray-300 px-3 py-2 text-sm font-medium transition ${
              visao === 'cards' ? 'bg-[#1f3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutGrid className="h-4 w-4" /> Cartões
          </button>
        </div>
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
        <button
          className={btnCls}
          onClick={() => {
            setPastaEmEdicao(null)
            setNomePasta('')
            setModalPasta(true)
          }}
        >
          <FolderPlus className="h-4 w-4" /> Nova pasta
        </button>
        <BotaoNovo onClick={() => setModal(true)}>Enviar arquivos</BotaoNovo>
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat rotulo="Arquivos guardados" valor={String(arquivos.length)} tom="destaque" />
        <Stat rotulo="Pastas" valor={String(pastas.length)} />
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
              placeholder="Nome ou descrição... (procura em todas as pastas)"
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

      {/* caminho das pastas */}
      <div className="no-print mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button
          onClick={() => setPastaAtual(null)}
          {...propsDestino(null, 'raiz')}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 transition ${
            pastaAtual === null ? 'font-semibold text-gray-900' : 'text-[#1f3a5f] hover:bg-gray-100'
          } ${realce('raiz')}`}
        >
          <Home className="h-3.5 w-3.5" /> Raiz
        </button>
        {caminho.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
            <button
              onClick={() => setPastaAtual(p.id)}
              {...propsDestino(p.id, `crumb-${p.id}`)}
              className={`rounded-lg px-2 py-1 transition ${
                i === caminho.length - 1
                  ? 'font-semibold text-gray-900'
                  : 'text-[#1f3a5f] hover:bg-gray-100'
              } ${realce(`crumb-${p.id}`)}`}
            >
              {p.nome}
            </button>
          </span>
        ))}
        {buscando && (
          <span className="ml-2 text-xs text-amber-700">resultados de todas as pastas</span>
        )}
      </div>

      {carregando ? (
        <Carregando />
      ) : subpastas.length === 0 && filtrados.length === 0 ? (
        <Vazio
          texto={
            arquivos.length === 0 && pastas.length === 0
              ? 'Nenhum arquivo ainda. Crie uma pasta ou envie os projetos e contratos.'
              : buscando
                ? 'Nenhum arquivo encontrado com esse filtro.'
                : 'Esta pasta está vazia. Arraste arquivos de outra pasta ou envie novos aqui.'
          }
        />
      ) : visao === 'lista' ? (
        <Card className="overflow-x-auto p-0">
          <table className="tabela-cartao w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">{buscando ? 'Pasta' : 'Categoria'}</th>
                <th className="px-4 py-3 text-right">Tamanho</th>
                <th className="px-4 py-3">Referência</th>
                <th className="px-4 py-3">Enviado em</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {!buscando && pastaAtual && (
                <tr
                  {...propsDestino(pastaDeCima ? pastaDeCima.id : null, 'voltar')}
                  onClick={() => setPastaAtual(pastaDeCima ? pastaDeCima.id : null)}
                  className={`cursor-pointer border-b border-gray-100 text-gray-500 hover:bg-gray-50 ${realce('voltar')}`}
                >
                  <td className="px-4 py-2" colSpan={6}>
                    <span className="flex items-center gap-2">
                      <CornerLeftUp className="h-4 w-4" /> Voltar para{' '}
                      {pastaDeCima ? pastaDeCima.nome : 'Raiz'}
                    </span>
                  </td>
                </tr>
              )}

              {subpastas.map((p) => {
                const dentro = conteudoDaPasta(p.id)
                return (
                  <tr
                    key={p.id}
                    draggable
                    onDragStart={(e) => aoComecarArrasto(e, { tipo: 'pasta', id: p.id, nome: p.nome })}
                    onDragEnd={() => setArrastando(null)}
                    {...propsDestino(p.id, `pasta-${p.id}`)}
                    className={`border-b border-gray-100 hover:bg-gray-50/60 ${realce(`pasta-${p.id}`)} ${
                      arrastando?.id === p.id ? 'opacity-40' : ''
                    }`}
                  >
                    <td data-rotulo="Nome" className="px-4 py-2.5">
                      <button
                        onClick={() => setPastaAtual(p.id)}
                        className="flex items-center gap-2 font-medium text-gray-900 hover:text-[#1f3a5f]"
                      >
                        <Folder className="h-4 w-4 shrink-0 text-[#b8893b]" />
                        {p.nome}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {dentro.arquivos} arquivo(s)
                      {dentro.subpastas > 0 && ` · ${dentro.subpastas} subpasta(s)`}
                    </td>
                    <td data-rotulo="Tamanho" className="tnum px-4 py-2.5 text-right text-gray-600">
                      {dentro.tamanho > 0 ? tamanhoArquivo(dentro.tamanho) : '—'}
                    </td>
                    <td data-rotulo="Referência" className="px-4 py-2.5" />
                    <td data-rotulo="Enviado em" className="px-4 py-2.5" />
                    <td className="acoes px-4 py-2.5">
                      <div className="flex justify-end gap-0.5">
                        <button
                          onClick={() => setAMover({ tipo: 'pasta', id: p.id, nome: p.nome })}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                          title="Mover para outra pasta"
                        >
                          <FolderInput className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setPastaEmEdicao(p)
                            setNomePasta(p.nome)
                            setModalPasta(true)
                          }}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                          title="Renomear"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => excluirPasta(p)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Excluir pasta"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filtrados.map((a) => {
                const Icone = iconeDe(a.nome, a.tipo_arquivo)
                return (
                  <tr
                    key={a.id}
                    draggable
                    onDragStart={(e) =>
                      aoComecarArrasto(e, { tipo: 'arquivo', id: a.id, nome: a.nome })
                    }
                    onDragEnd={() => setArrastando(null)}
                    className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/60 ${
                      arrastando?.id === a.id ? 'opacity-40' : ''
                    }`}
                  >
                    <td data-rotulo="Nome" className="px-4 py-2.5">
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
                      {buscando ? (
                        <span className="text-xs text-gray-600">
                          {caminhoTexto(pastas, a.pasta_id)}
                        </span>
                      ) : (
                        <Badge tom="azul">{LABEL_CATEGORIA[a.categoria]}</Badge>
                      )}
                    </td>
                    <td data-rotulo="Tamanho" className="tnum px-4 py-2.5 text-right text-gray-600">
                      {tamanhoArquivo(a.tamanho)}
                    </td>
                    <td data-rotulo="Referência" className="px-4 py-2.5 text-gray-600">
                      {a.data_referencia ? dataBR(a.data_referencia) : '—'}
                    </td>
                    <td data-rotulo="Enviado em" className="px-4 py-2.5 text-gray-600">{dataBR(a.created_at)}</td>
                    <td className="acoes px-4 py-2.5">
                      <div className="flex justify-end gap-0.5">
                        <button
                          onClick={() => setAMover({ tipo: 'arquivo', id: a.id, nome: a.nome })}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                          title="Mover para outra pasta"
                        >
                          <FolderInput className="h-4 w-4" />
                        </button>
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
                  {subpastas.length > 0 && `${subpastas.length} pasta(s) · `}
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
          {!buscando && pastaAtual && (
            <button
              {...propsDestino(pastaDeCima ? pastaDeCima.id : null, 'voltar')}
              onClick={() => setPastaAtual(pastaDeCima ? pastaDeCima.id : null)}
              className={`flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500 hover:border-gray-400 ${realce('voltar')}`}
            >
              <CornerLeftUp className="h-4 w-4" /> Voltar para{' '}
              {pastaDeCima ? pastaDeCima.nome : 'Raiz'}
            </button>
          )}

          {subpastas.map((p) => {
            const dentro = conteudoDaPasta(p.id)
            return (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => aoComecarArrasto(e, { tipo: 'pasta', id: p.id, nome: p.nome })}
                onDragEnd={() => setArrastando(null)}
                {...propsDestino(p.id, `pasta-${p.id}`)}
                className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition ${realce(
                  `pasta-${p.id}`
                )} ${arrastando?.id === p.id ? 'opacity-40' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => setPastaAtual(p.id)}
                    className="flex min-w-0 items-center gap-2 text-left"
                  >
                    <FolderOpen className="h-5 w-5 shrink-0 text-[#b8893b]" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900">{p.nome}</span>
                      <span className="block text-xs text-gray-500">
                        {dentro.arquivos} arquivo(s)
                        {dentro.subpastas > 0 && ` · ${dentro.subpastas} subpasta(s)`}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      onClick={() => setAMover({ tipo: 'pasta', id: p.id, nome: p.nome })}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                      title="Mover"
                    >
                      <FolderInput className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setPastaEmEdicao(p)
                        setNomePasta(p.nome)
                        setModalPasta(true)
                      }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                      title="Renomear"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => excluirPasta(p)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {filtrados.map((a) => {
            const Icone = iconeDe(a.nome, a.tipo_arquivo)
            return (
              <Card
                key={a.id}
                className={`flex flex-col ${arrastando?.id === a.id ? 'opacity-40' : ''}`}
              >
                <div
                  draggable
                  onDragStart={(e) =>
                    aoComecarArrasto(e, { tipo: 'arquivo', id: a.id, nome: a.nome })
                  }
                  onDragEnd={() => setArrastando(null)}
                  className="flex cursor-grab items-start gap-3 active:cursor-grabbing"
                >
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
                  {buscando ? `Em ${caminhoTexto(pastas, a.pasta_id)} · ` : ''}
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
                    onClick={() => setAMover({ tipo: 'arquivo', id: a.id, nome: a.nome })}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]"
                    title="Mover"
                  >
                    <FolderInput className="h-3.5 w-3.5" />
                  </button>
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
        titulo={`Enviar arquivos para ${caminhoTexto(pastas, pastaAtual)}`}
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
              <span className="text-[11px] text-gray-400">
                PDF, imagens, planilhas — até {LIMITE_MB} MB cada
              </span>
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
          <button
            className={btnPrimarioCls}
            onClick={enviar}
            disabled={enviando || selecionados.length === 0}
          >
            <Upload className="h-4 w-4" />
            {enviando ? 'Enviando...' : `Enviar ${selecionados.length || ''}`}
          </button>
        </div>
      </Modal>

      {/* ---------- modal de edicao ---------- */}
      <Modal
        aberto={!!edicao}
        titulo="Editar arquivo"
        onFechar={() => setEdicao(null)}
        largura="max-w-lg"
      >
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
              <Campo label="Pasta">
                <select
                  className={inputCls}
                  value={edicao.pasta_id || ''}
                  onChange={(e) => setEdicao({ ...edicao, pasta_id: e.target.value || null })}
                >
                  <option value="">Raiz</option>
                  {opcoesPastas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Categoria">
                <select
                  className={inputCls}
                  value={edicao.categoria}
                  onChange={(e) =>
                    setEdicao({ ...edicao, categoria: e.target.value as CategoriaArquivo })
                  }
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

      {/* ---------- modal de pasta ---------- */}
      <Modal
        aberto={modalPasta}
        titulo={
          pastaEmEdicao ? 'Renomear pasta' : `Nova pasta em ${caminhoTexto(pastas, pastaAtual)}`
        }
        onFechar={() => setModalPasta(false)}
        largura="max-w-md"
      >
        <Campo label="Nome da pasta">
          <input
            className={inputCls}
            value={nomePasta}
            onChange={(e) => setNomePasta(e.target.value)}
            placeholder="Ex.: Projetos aprovados"
            onKeyDown={(e) => e.key === 'Enter' && salvarPasta()}
          />
        </Campo>
        <div className="mt-5 flex justify-end gap-2">
          <button className={btnCls} onClick={() => setModalPasta(false)}>
            Cancelar
          </button>
          <button className={btnPrimarioCls} onClick={salvarPasta} disabled={!nomePasta.trim()}>
            <Save className="h-4 w-4" /> Salvar
          </button>
        </div>
      </Modal>

      {/* ---------- modal mover ---------- */}
      <Modal
        aberto={!!aMover}
        titulo={aMover ? `Mover "${aMover.nome}"` : 'Mover'}
        onFechar={() => setAMover(null)}
        largura="max-w-md"
      >
        {aMover && (
          <>
            <p className="mb-3 text-xs text-gray-500">
              No computador você também pode arrastar o item direto sobre a pasta.
            </p>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              <button
                onClick={() => moverPara(aMover, null)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
              >
                <Home className="h-4 w-4 text-gray-400" /> Raiz
              </button>
              {opcoesPastas
                .filter(
                  (p) =>
                    !(
                      aMover.tipo === 'pasta' &&
                      pastaComDescendentes(pastas, aMover.id).includes(p.id)
                    )
                )
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => moverPara(aMover, p.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-[#b8893b]" />
                    <span className="whitespace-pre">{p.rotulo}</span>
                  </button>
                ))}
              {opcoesPastas.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-gray-400">
                  Nenhuma pasta criada ainda.
                </p>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
