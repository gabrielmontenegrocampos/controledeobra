'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardList,
  Receipt,
  Package,
  Wallet,
  NotebookPen,
  FolderOpen,
  Menu,
  X,
} from 'lucide-react'

const ITENS = [
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/orcamento', label: 'Orçamento', Icon: ClipboardList },
  { href: '/lancamentos', label: 'Lançamentos', Icon: Receipt },
  { href: '/materiais', label: 'Materiais', Icon: Package },
  { href: '/caixa', label: 'Caixa', Icon: Wallet },
  { href: '/diario', label: 'Diário de Obra', Icon: NotebookPen },
  { href: '/arquivos', label: 'Arquivos', Icon: FolderOpen },
]

export function Nav() {
  const path = usePathname()
  const [aberto, setAberto] = useState(false)

  const ativo = (href: string) => (href === '/' ? path === '/' : path.startsWith(href))

  // fecha o menu do celular ao trocar de pagina
  useEffect(() => {
    setAberto(false)
  }, [path])

  const lista = (
    <nav className="flex flex-col gap-0.5 p-3">
      {ITENS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
            ativo(href)
              ? 'bg-white/15 font-medium text-white'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  )

  const marca = (
    <Link href="/" className="flex flex-col gap-0.5 border-b border-white/10 px-5 py-4 leading-tight">
      <span className="text-sm font-semibold tracking-wide text-white">OBRA LAGOA SANTA</span>
      <span className="text-[11px] text-white/50">Controle de custos</span>
    </Link>
  )

  return (
    <>
      {/* barra lateral - desktop */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[#1f3a5f] md:flex">
        {marca}
        {lista}
        <p className="mt-auto px-5 py-4 text-[11px] leading-relaxed text-white/40">
          Rua Sabiá, 130 e 132
          <br />
          Vila dos Ypês — Lagoa Santa/MG
        </p>
      </aside>

      {/* barra superior - celular */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 bg-[#1f3a5f] px-4 py-3 md:hidden">
        <button
          onClick={() => setAberto(true)}
          className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold tracking-wide text-white">OBRA LAGOA SANTA</span>
      </header>

      {/* gaveta - celular */}
      {aberto && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <button
            className="absolute inset-0 bg-black/50"
            onClick={() => setAberto(false)}
            aria-label="Fechar menu"
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-[#1f3a5f] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pr-2">
              <div className="flex-1">{marca}</div>
              <button
                onClick={() => setAberto(false)}
                className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {lista}
          </div>
        </div>
      )}
    </>
  )
}
