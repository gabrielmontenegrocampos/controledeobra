'use client'

import { useRef, useState } from 'react'
import { Paperclip, ExternalLink, Trash2, Loader2 } from 'lucide-react'
import { enviarArquivo } from '@/lib/supabase'
import { prepararImagem } from '@/lib/imagem'

export function Anexo({
  label,
  pasta,
  url,
  onChange,
}: {
  label: string
  pasta: string
  url: string | null
  onChange: (url: string | null) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  async function selecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 15 * 1024 * 1024) {
      setErro('Arquivo maior que 15 MB.')
      return
    }
    setErro(null)
    setEnviando(true)
    try {
      const { arquivo, aviso } = await prepararImagem(file)
      if (aviso) setErro(aviso)
      onChange(await enviarArquivo(arquivo, pasta))
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha no envio.')
    } finally {
      setEnviando(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>

      {url ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <Paperclip className="h-4 w-4 shrink-0 text-emerald-600" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 truncate text-sm text-emerald-800 underline"
          >
            Ver arquivo anexado
          </a>
          <ExternalLink className="h-3.5 w-3.5 text-emerald-600" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-1 text-red-500 hover:bg-red-100"
            title="Remover anexo"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-600 hover:border-[#1f3a5f] hover:bg-gray-100">
          {enviando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
            </>
          ) : (
            <>
              <Paperclip className="h-4 w-4" /> Escolher arquivo (foto ou PDF)
            </>
          )}
          <input
            ref={ref}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={enviando}
            onChange={selecionar}
          />
        </label>
      )}

      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  )
}
