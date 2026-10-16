'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { Pencil, Trash2, Save, Plus, Users, AlertTriangle, Camera, Loader2, FileDown } from 'lucide-react'
import { supabase, enviarArquivo, mensagemErro } from '@/lib/supabase'
import { dataBR, hoje, num, LABEL_CLIMA, LABEL_SEVERIDADE, LABEL_TIPO_OCORRENCIA } from '@/lib/format'
import { exportarPDF, exportarXLSX } from '@/lib/report'
import type { EquipeDia, Foto, Ocorrencia, Registro } from '@/lib/types'
import { VisorFotos } from '@/components/visor-fotos'
import { prepararImagem } from '@/lib/imagem'
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
  data: string
  clima: string
  temperatura: string
  descricao: string
  equipe: EquipeDia[]
  ocorrencias: Ocorrencia[]
  fotos: Foto[]
}

const FORM_VAZIO: Form = {
  data: hoje(),
  clima: 'sol',
  temperatura: '',
  descricao: '',
  equipe: [],
  ocorrencias: [],
  fotos: [],
}

export default function DiarioPage() {
  const [registros, setRegistros] = useState<Registro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [form, setForm] = useState<Form>(FORM_VAZIO)
  const [periodo, setPeriodo] = useState({ de: '', ate: '' })
  const [visor, setVisor] = useState<{ fotos: Foto[]; indice: number; titulo: string } | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('registros')
      .select('*, fotos(*), equipe_dia(*), ocorrencias(*)')
      .order('data', { ascending: false })
    if (error) setErro(mensagemErro(error))
    else setRegistros((data as Registro[]) || [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const filtrados = registros.filter(
    (r) => (!periodo.de || r.data >= periodo.de) && (!periodo.ate || r.data <= periodo.ate)
  )

  function abrirNovo() {
    setForm(FORM_VAZIO)
    setModal(true)
  }

  function abrirEdicao(r: Registro) {
    setForm({
      id: r.id,
      data: r.data,
      clima: r.clima || 'sol',
      temperatura: r.temperatura != null ? String(r.temperatura) : '',
      descricao: r.descricao || '',
      equipe: r.equipe_dia || [],
      ocorrencias: r.ocorrencias || [],
      fotos: r.fotos || [],
    })
    setModal(true)
  }

  async function subirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setEnviandoFoto(true)
    setErro(null)
    try {
      const novas: Foto[] = []
      const avisos: string[] = []
      for (const f of files) {
        const { arquivo, aviso } = await prepararImagem(f)
        if (aviso) avisos.push(aviso)
        const url = await enviarArquivo(arquivo, 'diario')
        novas.push({ url, legenda: null })
      }
      setForm((f) => ({ ...f, fotos: [...f.fotos, ...novas] }))
      if (avisos.length) setErro(avisos.join(' '))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao enviar foto.')
    } finally {
      setEnviandoFoto(false)
      e.target.value = ''
    }
  }

  async function salvar() {
    if (!form.data) return setErro('Informe a data.')
    setSalvando(true)
    setErro(null)

    const payload = {
      data: form.data,
      clima: form.clima || null,
      temperatura: form.temperatura ? Number(form.temperatura) : null,
      descricao: form.descricao.trim() || null,
    }

    let registroId = form.id

    if (form.id) {
      const { error } = await supabase.from('registros').update(payload).eq('id', form.id)
      if (error) {
        setSalvando(false)
        return setErro(mensagemErro(error))
      }
      await Promise.all([
        supabase.from('equipe_dia').delete().eq('registro_id', form.id),
        supabase.from('ocorrencias').delete().eq('registro_id', form.id),
        supabase.from('fotos').delete().eq('registro_id', form.id),
      ])
    } else {
      const { data, error } = await supabase.from('registros').insert(payload).select('id').single()
      if (error) {
        setSalvando(false)
        return setErro(
          error.code === '23505' || mensagemErro(error).includes('duplicate')
            ? 'Já existe um registro para esta data. Edite o registro existente.'
            : mensagemErro(error)
        )
      }
      registroId = data.id
    }

    const equipe = form.equipe
      .filter((e) => e.nome.trim())
      .map((e) => ({ registro_id: registroId, nome: e.nome.trim(), funcao: e.funcao || null, horas: e.horas ?? null }))
    const ocorrencias = form.ocorrencias
      .filter((o) => o.descricao.trim())
      .map((o) => ({ registro_id: registroId, descricao: o.descricao.trim(), tipo: o.tipo, severidade: o.severidade }))
    const fotos = form.fotos.map((f) => ({ registro_id: registroId, url: f.url, legenda: f.legenda || null }))

    if (equipe.length) await supabase.from('equipe_dia').insert(equipe)
    if (ocorrencias.length) await supabase.from('ocorrencias').insert(ocorrencias)
    if (fotos.length) await supabase.from('fotos').insert(fotos)

    setSalvando(false)
    setModal(false)
    setForm(FORM_VAZIO)
    carregar()
  }

  async function excluir(r: Registro) {
    if (!confirm(`Excluir o registro de ${dataBR(r.data)}?`)) return
    const { error } = await supabase.from('registros').delete().eq('id', r.id)
    if (error) setErro(mensagemErro(error))
    else carregar()
  }

  // ---------- relatorios ----------
  const colunas = ['Data', 'Clima', 'Temp.', 'Equipe', 'Horas', 'Ocorrências', 'Fotos', 'Atividades']
  const linhas = filtrados.map((r) => [
    dataBR(r.data),
    r.clima ? LABEL_CLIMA[r.clima] : '—',
    r.temperatura != null ? `${r.temperatura}°C` : '—',
    String(r.equipe_dia?.length || 0),
    num((r.equipe_dia || []).reduce((s, e) => s + Number(e.horas || 0), 0), 1),
    String(r.ocorrencias?.length || 0),
    String(r.fotos?.length || 0),
    (r.descricao || '—').slice(0, 220),
  ])

  function gerarPDF() {
    const totalHoras = filtrados.reduce(
      (s, r) => s + (r.equipe_dia || []).reduce((h, e) => h + Number(e.horas || 0), 0),
      0
    )
    exportarPDF({
      titulo: 'Diário de Obra',
      subtitulo:
        periodo.de || periodo.ate
          ? `Período: ${periodo.de ? dataBR(periodo.de) : 'início'} a ${periodo.ate ? dataBR(periodo.ate) : 'hoje'}`
          : 'Todos os registros',
      colunas,
      linhas,
      resumo: [
        { rotulo: 'Dias registrados', valor: String(filtrados.length) },
        { rotulo: 'Horas de equipe', valor: num(totalHoras, 1) },
        {
          rotulo: 'Ocorrências',
          valor: String(filtrados.reduce((s, r) => s + (r.ocorrencias?.length || 0), 0)),
        },
        { rotulo: 'Fotos', valor: String(filtrados.reduce((s, r) => s + (r.fotos?.length || 0), 0)) },
      ],
      paisagem: true,
      arquivo: 'diario-de-obra',
    })
  }

  function gerarXLSX() {
    const equipeLinhas = filtrados.flatMap((r) =>
      (r.equipe_dia || []).map((e) => [dataBR(r.data), e.nome, e.funcao || '—', Number(e.horas || 0)])
    )
    const ocorrLinhas = filtrados.flatMap((r) =>
      (r.ocorrencias || []).map((o) => [
        dataBR(r.data),
        LABEL_TIPO_OCORRENCIA[o.tipo],
        LABEL_SEVERIDADE[o.severidade],
        o.descricao,
      ])
    )
    exportarXLSX('diario-de-obra', [
      { nome: 'Registros', colunas, linhas },
      { nome: 'Equipe', colunas: ['Data', 'Nome', 'Função', 'Horas'], linhas: equipeLinhas },
      { nome: 'Ocorrências', colunas: ['Data', 'Tipo', 'Severidade', 'Descrição'], linhas: ocorrLinhas },
    ])
  }

  const totalHorasFiltro = filtrados.reduce(
    (s, r) => s + (r.equipe_dia || []).reduce((h, e) => h + Number(e.horas || 0), 0),
    0
  )

  return (
    <>
      <TituloSecao titulo="Diário de Obra" descricao="O que aconteceu em cada dia: equipe, clima, ocorrências e fotos.">
        <BotoesRelatorio onPDF={gerarPDF} onXLSX={gerarXLSX} />
        <BotaoNovo onClick={abrirNovo}>Novo registro</BotaoNovo>
      </TituloSecao>

      <AvisoConfig />
      <Erro mensagem={erro} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat rotulo="Dias registrados" valor={String(filtrados.length)} tom="destaque" />
        <Stat rotulo="Horas de equipe" valor={num(totalHorasFiltro, 1)} />
        <Stat rotulo="Ocorrências" valor={String(filtrados.reduce((s, r) => s + (r.ocorrencias?.length || 0), 0))} />
        <Stat rotulo="Fotos" valor={String(filtrados.reduce((s, r) => s + (r.fotos?.length || 0), 0))} />
      </div>

      <Card className="no-print mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="De">
            <input type="date" className={inputCls} value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} />
          </Campo>
          <Campo label="Até">
            <input type="date" className={inputCls} value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} />
          </Campo>
          <div className="flex items-end">
            <button className={btnCls} onClick={() => setPeriodo({ de: '', ate: '' })}>Limpar período</button>
          </div>
        </div>
      </Card>

      {carregando ? (
        <Carregando />
      ) : filtrados.length === 0 ? (
        <Vazio texto="Nenhum registro no período. Clique em 'Novo registro' para começar." />
      ) : (
        <div className="space-y-3">
          {filtrados.map((r) => {
            const horas = (r.equipe_dia || []).reduce((s, e) => s + Number(e.horas || 0), 0)
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{dataBR(r.data)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      {r.clima && <Badge tom="azul">{LABEL_CLIMA[r.clima]}</Badge>}
                      {r.temperatura != null && <span>{r.temperatura}°C</span>}
                      {(r.equipe_dia?.length || 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {r.equipe_dia!.length} pessoa(s) · {num(horas, 1)}h
                        </span>
                      )}
                      {(r.ocorrencias?.length || 0) > 0 && (
                        <span className="flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" /> {r.ocorrencias!.length} ocorrência(s)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="no-print flex gap-1">
                    <button onClick={() => abrirEdicao(r)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-[#1f3a5f]">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => excluir(r)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {r.descricao && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{r.descricao}</p>}

                {(r.equipe_dia?.length || 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.equipe_dia!.map((e, i) => (
                      <span key={e.id || i} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                        {e.nome}
                        {e.funcao ? ` · ${e.funcao}` : ''}
                        {e.horas ? ` · ${num(e.horas, 1)}h` : ''}
                      </span>
                    ))}
                  </div>
                )}

                {(r.ocorrencias?.length || 0) > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {r.ocorrencias!.map((o, i) => (
                      <div key={o.id || i} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <Badge tom={o.severidade === 'alta' ? 'vermelho' : o.severidade === 'media' ? 'amarelo' : 'cinza'}>
                          {LABEL_TIPO_OCORRENCIA[o.tipo]} · {LABEL_SEVERIDADE[o.severidade]}
                        </Badge>
                        <span>{o.descricao}</span>
                      </div>
                    ))}
                  </div>
                )}

                {(r.fotos?.length || 0) > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {r.fotos!.slice(0, 6).map((f, i) => {
                      const restantes = r.fotos!.length - 6
                      const ultima = i === 5 && restantes > 0
                      return (
                        <button
                          key={f.id || i}
                          type="button"
                          onClick={() =>
                            setVisor({ fotos: r.fotos!, indice: i, titulo: dataBR(r.data) })
                          }
                          className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200"
                          aria-label={
                            ultima
                              ? `Ver as ${r.fotos!.length} fotos de ${dataBR(r.data)}`
                              : `Ver foto ${i + 1} de ${dataBR(r.data)}`
                          }
                        >
                          <Image
                            src={f.url}
                            alt={f.legenda || 'Foto da obra'}
                            fill
                            sizes="(max-width: 768px) 33vw, 160px"
                            quality={65}
                            className="object-cover transition group-hover:brightness-90"
                          />
                          {ultima && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-base font-semibold text-white">
                              +{restantes}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ---------- modal ---------- */}
      <Modal
        aberto={modal}
        titulo={form.id ? `Registro de ${dataBR(form.data)}` : 'Novo registro'}
        onFechar={() => setModal(false)}
        largura="max-w-3xl"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Data">
            <input type="date" className={inputCls} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
          </Campo>
          <Campo label="Clima">
            <select className={inputCls} value={form.clima} onChange={(e) => setForm({ ...form, clima: e.target.value })}>
              {Object.entries(LABEL_CLIMA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Temperatura (°C)">
            <input type="number" className={`${inputCls} tnum`} value={form.temperatura} onChange={(e) => setForm({ ...form, temperatura: e.target.value })} />
          </Campo>
          <Campo label="Atividades do dia" className="sm:col-span-3">
            <textarea
              className={`${inputCls} min-h-28`}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="O que foi executado hoje, em qual casa, quais frentes de serviço..."
            />
          </Campo>
        </div>

        {/* equipe */}
        <div className="mt-5 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-sm font-medium text-gray-800">Equipe do dia</p>
            <button
              type="button"
              className={btnCls}
              onClick={() => setForm({ ...form, equipe: [...form.equipe, { nome: '', funcao: '', horas: 8 }] })}
            >
              <Plus className="h-4 w-4" /> Pessoa
            </button>
          </div>
          {form.equipe.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-gray-400">Ninguém lançado.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {form.equipe.map((e, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2">
                  <input
                    className={`${inputCls} col-span-12 sm:col-span-5`}
                    placeholder="Nome"
                    value={e.nome}
                    onChange={(ev) => {
                      const equipe = [...form.equipe]
                      equipe[idx] = { ...e, nome: ev.target.value }
                      setForm({ ...form, equipe })
                    }}
                  />
                  <input
                    className={`${inputCls} col-span-7 sm:col-span-4`}
                    placeholder="Função"
                    value={e.funcao || ''}
                    onChange={(ev) => {
                      const equipe = [...form.equipe]
                      equipe[idx] = { ...e, funcao: ev.target.value }
                      setForm({ ...form, equipe })
                    }}
                  />
                  <input
                    type="number"
                    step="0.5"
                    className={`${inputCls} tnum col-span-3 sm:col-span-2 text-right`}
                    placeholder="h"
                    value={e.horas ?? ''}
                    onChange={(ev) => {
                      const equipe = [...form.equipe]
                      equipe[idx] = { ...e, horas: ev.target.value ? Number(ev.target.value) : null }
                      setForm({ ...form, equipe })
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, equipe: form.equipe.filter((_, i) => i !== idx) })}
                    className="col-span-2 flex justify-center rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 sm:col-span-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ocorrencias */}
        <div className="mt-4 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-sm font-medium text-gray-800">Ocorrências</p>
            <button
              type="button"
              className={btnCls}
              onClick={() =>
                setForm({
                  ...form,
                  ocorrencias: [...form.ocorrencias, { descricao: '', tipo: 'observacao', severidade: 'baixa' }],
                })
              }
            >
              <Plus className="h-4 w-4" /> Ocorrência
            </button>
          </div>
          {form.ocorrencias.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-gray-400">Nenhuma ocorrência.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {form.ocorrencias.map((o, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2">
                  <input
                    className={`${inputCls} col-span-12 sm:col-span-6`}
                    placeholder="O que aconteceu"
                    value={o.descricao}
                    onChange={(ev) => {
                      const oc = [...form.ocorrencias]
                      oc[idx] = { ...o, descricao: ev.target.value }
                      setForm({ ...form, ocorrencias: oc })
                    }}
                  />
                  <select
                    className={`${inputCls} col-span-6 sm:col-span-2`}
                    value={o.tipo}
                    onChange={(ev) => {
                      const oc = [...form.ocorrencias]
                      oc[idx] = { ...o, tipo: ev.target.value as Ocorrencia['tipo'] }
                      setForm({ ...form, ocorrencias: oc })
                    }}
                  >
                    {Object.entries(LABEL_TIPO_OCORRENCIA).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <select
                    className={`${inputCls} col-span-5 sm:col-span-3`}
                    value={o.severidade}
                    onChange={(ev) => {
                      const oc = [...form.ocorrencias]
                      oc[idx] = { ...o, severidade: ev.target.value as Ocorrencia['severidade'] }
                      setForm({ ...form, ocorrencias: oc })
                    }}
                  >
                    {Object.entries(LABEL_SEVERIDADE).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, ocorrencias: form.ocorrencias.filter((_, i) => i !== idx) })}
                    className="col-span-1 flex justify-center rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* fotos */}
        <div className="mt-4">
          <span className="mb-1 block text-xs font-medium text-gray-600">Fotos do dia</span>
          <div className="flex flex-wrap gap-2">
            {form.fotos.map((f, idx) => (
              <div key={idx} className="relative">
                <Image
                  src={f.url}
                  alt="Foto"
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded-lg border border-gray-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, fotos: form.fotos.filter((_, i) => i !== idx) })}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-1 text-white shadow"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500 hover:border-[#1f3a5f]">
              {enviandoFoto ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
              {enviandoFoto ? 'Enviando' : 'Adicionar'}
              <input type="file" accept="image/*" multiple className="hidden" disabled={enviandoFoto} onChange={subirFotos} />
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className={btnCls} onClick={() => setModal(false)}>Cancelar</button>
          <button className={btnPrimarioCls} onClick={salvar} disabled={salvando || enviandoFoto}>
            <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar registro'}
          </button>
        </div>
      </Modal>

      {visor && (
        <VisorFotos
          fotos={visor.fotos}
          indice={visor.indice}
          titulo={`Diário de ${visor.titulo}`}
          onIr={(novo) => setVisor({ ...visor, indice: novo })}
          onFechar={() => setVisor(null)}
        />
      )}

      <p className="no-print mt-6 flex items-center gap-1.5 text-xs text-gray-400">
        <FileDown className="h-3.5 w-3.5" /> Use PDF para enviar o diário ao cliente ou ao investidor.
      </p>
    </>
  )
}
