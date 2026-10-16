'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from 'lucide-react'
import type { Foto } from '@/lib/types'

/**
 * Visor de fotos em tela cheia: setas dos lados, miniaturas embaixo,
 * setas do teclado e Esc no computador, deslizar com o dedo no celular.
 */
export function VisorFotos({
  fotos,
  indice,
  onIr,
  onFechar,
  titulo,
}: {
  fotos: Foto[]
  indice: number
  onIr: (novo: number) => void
  onFechar: () => void
  titulo?: string
}) {
  const [toqueX, setToqueX] = useState<number | null>(null)
  const [prontas, setProntas] = useState<Record<string, boolean>>({})
  const tiraRef = useRef<HTMLDivElement>(null)

  const anterior = useCallback(() => {
    onIr((indice - 1 + fotos.length) % fotos.length)
  }, [indice, fotos.length, onIr])

  const proxima = useCallback(() => {
    onIr((indice + 1) % fotos.length)
  }, [indice, fotos.length, onIr])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
      if (e.key === 'ArrowLeft') anterior()
      if (e.key === 'ArrowRight') proxima()
    }
    window.addEventListener('keydown', tecla)
    const anteriorOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', tecla)
      document.body.style.overflow = anteriorOverflow
    }
  }, [anterior, proxima, onFechar])

  // mantem a miniatura da foto aberta sempre visivel na tira
  useEffect(() => {
    const ativa = tiraRef.current?.querySelector('[data-ativa="sim"]')
    ativa?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [indice])

  const foto = fotos[indice]
  if (!foto) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* topo */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {indice + 1} de {fotos.length}
          </p>
          {titulo && <p className="truncate text-xs text-white/60">{titulo}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={foto.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            title="Abrir em nova aba"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
          <a
            href={foto.url}
            download
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            title="Baixar"
          >
            <Download className="h-5 w-5" />
          </a>
          <button
            onClick={onFechar}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* foto */}
      <div
        className="relative min-h-0 flex-1"
        onTouchStart={(e) => setToqueX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (toqueX === null) return
          const distancia = e.changedTouches[0].clientX - toqueX
          if (Math.abs(distancia) > 50) {
            if (distancia < 0) proxima()
            else anterior()
          }
          setToqueX(null)
        }}
      >
        {fotos.map((f, i) => {
          const vizinha =
            i === indice ||
            i === (indice + 1) % fotos.length ||
            i === (indice - 1 + fotos.length) % fotos.length
          if (!vizinha) return null
          return (
            <Image
              key={f.url}
              src={f.url}
              alt={f.legenda || `Foto ${i + 1}`}
              fill
              sizes="100vw"
              priority={i === indice}
              onLoad={() => setProntas((p) => ({ ...p, [f.url]: true }))}
              onClick={onFechar}
              className={`object-contain transition-opacity duration-200 ${
                i === indice ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            />
          )
        })}

        {!prontas[foto.url] && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          </span>
        )}

        {fotos.length > 1 && (
          <>
            <button
              onClick={anterior}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button
              onClick={proxima}
              aria-label="Próxima foto"
              className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        )}
      </div>

      {/* legenda */}
      {foto.legenda && (
        <p className="px-4 pb-1 pt-2 text-center text-sm text-white/80">{foto.legenda}</p>
      )}

      {/* miniaturas */}
      {fotos.length > 1 && (
        <div
          ref={tiraRef}
          className="flex gap-2 overflow-x-auto px-4 py-3"
          style={{ scrollbarWidth: 'thin' }}
        >
          {fotos.map((f, i) => (
            <button
              key={f.url}
              data-ativa={i === indice ? 'sim' : undefined}
              onClick={() => onIr(i)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg transition ${
                i === indice
                  ? 'ring-2 ring-white'
                  : 'opacity-50 hover:opacity-100'
              }`}
              aria-label={`Ver foto ${i + 1}`}
            >
              <Image src={f.url} alt="" fill sizes="56px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
