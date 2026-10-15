'use client'

import { ReactNode, useEffect } from 'react'
import { X, FileDown, Sheet, Plus, AlertTriangle } from 'lucide-react'
import { supabaseConfigurado } from '@/lib/supabase'
import { apenasDigitos, limparNumerico, num, numEnxuto, parseMoeda } from '@/lib/format'

export const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base outline-none focus:border-[#1f3a5f] focus:ring-2 focus:ring-[#1f3a5f]/15 md:py-2 md:text-sm'

export const btnCls =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 md:min-h-0'

export const btnPrimarioCls =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[#1f3a5f] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2b4d79] disabled:opacity-50 md:min-h-0'

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function Stat({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
}: {
  rotulo: string
  valor: string
  detalhe?: string
  tom?: 'neutro' | 'positivo' | 'negativo' | 'destaque'
}) {
  const cor = {
    neutro: 'text-gray-900',
    positivo: 'text-emerald-600',
    negativo: 'text-red-600',
    destaque: 'text-[#1f3a5f]',
  }[tom]

  return (
    <Card className="p-3 md:p-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 md:text-[11px]">
        {rotulo}
      </p>
      <p className={`tnum mt-0.5 text-lg font-bold md:mt-1 md:text-2xl ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-[11px] leading-snug text-gray-500 md:mt-1 md:text-xs">{detalhe}</p>}
    </Card>
  )
}

export function Barra({
  valor,
  max,
  cor = '#1f3a5f',
}: {
  valor: number
  max: number
  cor?: string
}) {
  const pc = max > 0 ? Math.min(100, (valor / max) * 100) : 0
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
      <div className="h-full rounded-full transition-all" style={{ width: `${pc}%`, background: cor }} />
    </div>
  )
}

export function Badge({
  children,
  tom = 'cinza',
}: {
  children: ReactNode
  tom?: 'cinza' | 'verde' | 'amarelo' | 'vermelho' | 'azul'
}) {
  const cls = {
    cinza: 'bg-gray-100 text-gray-700',
    verde: 'bg-emerald-100 text-emerald-700',
    amarelo: 'bg-amber-100 text-amber-800',
    vermelho: 'bg-red-100 text-red-700',
    azul: 'bg-blue-100 text-blue-700',
  }[tom]
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  )
}

export function TituloSecao({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children?: ReactNode
}) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{titulo}</h1>
        {descricao && <p className="mt-0.5 text-sm text-gray-500">{descricao}</p>}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">{children}</div>
    </div>
  )
}

export function BotoesRelatorio({
  onPDF,
  onXLSX,
}: {
  onPDF: () => void
  onXLSX: () => void
}) {
  return (
    <>
      <button type="button" onClick={onPDF} className={btnCls}>
        <FileDown className="h-4 w-4" /> PDF
      </button>
      <button type="button" onClick={onXLSX} className={btnCls}>
        <Sheet className="h-4 w-4" /> Excel
      </button>
    </>
  )
}

export function BotaoNovo({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={btnPrimarioCls}>
      <Plus className="h-4 w-4" /> {children}
    </button>
  )
}

/**
 * Campos numericos do app.
 *
 * Enquanto a pessoa digita, so passa o que pode existir num numero.
 * Ao sair do campo, o valor se ajeita no padrao brasileiro
 * (1.234,56) — assim ninguem precisa digitar ponto de milhar.
 */
export function InputMoeda({
  valor,
  onChange,
  casas = 2,
  className = '',
  placeholder = '0,00',
  readOnly = false,
}: {
  valor: string
  onChange: (v: string) => void
  casas?: number
  className?: string
  placeholder?: string
  readOnly?: boolean
}) {
  // Mascara de banco: conta so os digitos e vai enchendo da direita
  // para a esquerda, formatando a cada tecla. 389000 -> 3.890,00
  function aoDigitar(bruto: string) {
    const digitos = bruto.replace(/\D/g, '').slice(0, 15)
    if (!digitos) return onChange('')
    onChange(num(Number(digitos) / 100, 2))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={`${inputCls} tnum text-right ${className}`}
      value={valor}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(e) => !readOnly && aoDigitar(e.target.value)}
      onBlur={(e) => {
        if (readOnly) return
        const v = parseMoeda(e.target.value)
        onChange(e.target.value.trim() === '' ? '' : num(v, casas))
      }}
    />
  )
}

/** Quantidade: ate 3 casas, sem zeros sobrando (12,5 em vez de 12,500) */
export function InputQuantidade({
  valor,
  onChange,
  className = '',
  placeholder = '0',
}: {
  valor: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      className={`${inputCls} tnum text-right ${className}`}
      value={valor}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(limparNumerico(e.target.value))}
      onBlur={(e) => {
        const v = parseMoeda(e.target.value)
        onChange(e.target.value.trim() === '' ? '' : numEnxuto(v, 3))
      }}
    />
  )
}

/** So digitos — numero de nota, temperatura e afins */
export function InputDigitos({
  valor,
  onChange,
  className = '',
  placeholder,
  max,
}: {
  valor: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
  max?: number
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className={`${inputCls} ${className}`}
      value={valor}
      placeholder={placeholder}
      onChange={(e) => {
        const d = apenasDigitos(e.target.value)
        onChange(max ? d.slice(0, max) : d)
      }}
    />
  )
}

/** Percentual de 0 a 100, com uma casa */
export function InputPercentual({
  valor,
  onChange,
  className = '',
}: {
  valor: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        className={`${inputCls} tnum pr-6 text-right ${className}`}
        value={valor}
        placeholder="0"
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(limparNumerico(e.target.value))}
        onBlur={(e) => {
          const v = Math.max(0, Math.min(100, parseMoeda(e.target.value)))
          onChange(e.target.value.trim() === '' ? '0' : numEnxuto(v, 1))
        }}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
        %
      </span>
    </div>
  )
}

export function Modal({
  aberto,
  titulo,
  onFechar,
  children,
  largura = 'max-w-2xl',
}: {
  aberto: boolean
  titulo: string
  onFechar: () => void
  children: ReactNode
  largura?: string
}) {
  useEffect(() => {
    if (!aberto) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', esc)
      document.body.style.overflow = ''
    }
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    // O modal nunca passa da altura da tela: o cabecalho fica parado e
    // quem rola e o corpo. Assim o topo nao some em janela baixa.
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3 sm:p-6">
      <div
        className={`flex w-full ${largura} max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-xl bg-white shadow-xl sm:max-h-[calc(100dvh-3rem)]`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">{titulo}</h2>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Campo({
  label,
  children,
  className = '',
  dica,
}: {
  label: string
  children: ReactNode
  className?: string
  dica?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
      {dica && <span className="mt-1 block text-[11px] text-gray-400">{dica}</span>}
    </label>
  )
}

export function Carregando() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#1f3a5f]" />
      Carregando...
    </div>
  )
}

export function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center text-sm text-gray-500">
      {texto}
    </div>
  )
}

export function Erro({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{mensagem}</span>
    </div>
  )
}

/** Avisa quando as variaveis do Supabase nao estao configuradas */
export function AvisoConfig() {
  if (supabaseConfigurado) return null
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>Supabase não configurado.</strong> Crie o arquivo <code>.env.local</code> com
      <code className="mx-1">NEXT_PUBLIC_SUPABASE_URL</code> e
      <code className="mx-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
      (e as mesmas variáveis na Vercel). Depois rode o <code>supabase/schema.sql</code> no SQL Editor.
    </div>
  )
}
