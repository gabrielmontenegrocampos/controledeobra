'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardList,
  Receipt,
  Package,
  Wallet,
  NotebookPen,
} from 'lucide-react'

const ITENS = [
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/orcamento', label: 'Orçamento', Icon: ClipboardList },
  { href: '/lancamentos', label: 'Lançamentos', Icon: Receipt },
  { href: '/materiais', label: 'Materiais', Icon: Package },
  { href: '/caixa', label: 'Caixa', Icon: Wallet },
  { href: '/diario', label: 'Diário', Icon: NotebookPen },
]

export function Nav() {
  const path = usePathname()
  const ativo = (href: string) => (href === '/' ? path === '/' : path.startsWith(href))

  return (
    <>
      {/* topo */}
      <header className="no-print sticky top-0 z-20 border-b border-gray-200 bg-[#1f3a5f] text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-wide">OBRA LAGOA SANTA</span>
            <span className="text-[11px] text-white/60">Controle de custos</span>
          </Link>

          <nav className="ml-auto hidden gap-1 md:flex">
            {ITENS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition ${
                  ativo(href)
                    ? 'bg-white/15 font-medium text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* barra inferior no celular */}
      <nav className="no-print fixed bottom-0 left-0 right-0 z-20 grid grid-cols-6 border-t border-gray-200 bg-white md:hidden">
        {ITENS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${
              ativo(href) ? 'text-[#1f3a5f] font-semibold' : 'text-gray-500'
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}
