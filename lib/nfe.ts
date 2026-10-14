/**
 * Leitor do XML de NF-e (modelo 55) e NFC-e (65).
 * Roda no navegador, sem dependencia: usa o DOMParser.
 *
 * Aceita tanto o arquivo com <nfeProc> (com protocolo de autorizacao)
 * quanto o XML "cru" comecando em <NFe>.
 */

export type ItemNFe = {
  material: string
  unidade: string
  quantidade: number
  valor_unit: number
}

export type NotaFiscal = {
  fornecedor: string
  cnpj: string | null
  nf_numero: string | null
  serie: string | null
  data_emissao: string | null
  valor_total: number
  valor_itens: number
  chave: string | null
  itens: ItemNFe[]
}

/** Todos os descendentes com esse nome, ignorando prefixo de namespace */
function tags(raiz: Element | Document, nome: string): Element[] {
  return Array.from(raiz.getElementsByTagName('*')).filter((e) => e.localName === nome)
}

function texto(raiz: Element | Document, nome: string): string | null {
  const el = tags(raiz, nome)[0]
  const v = el?.textContent?.trim()
  return v || null
}

function numero(raiz: Element, nome: string): number {
  const v = texto(raiz, nome)
  const n = v ? parseFloat(v) : 0
  return isNaN(n) ? 0 : n
}

function arredondar(n: number, casas: number) {
  const f = Math.pow(10, casas)
  return Math.round(n * f) / f
}

function formatarCNPJ(v: string | null) {
  if (!v) return null
  const d = v.replace(/\D/g, '')
  if (d.length !== 14) return v
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export function lerNFe(xml: string): NotaFiscal {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')

  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Não consegui ler o arquivo: ele não é um XML válido.')
  }

  const infNFe = tags(doc, 'infNFe')[0]
  if (!infNFe) {
    throw new Error(
      'Este XML não é de uma NF-e. Use o arquivo que o fornecedor envia por e-mail (começa com <nfeProc> ou <NFe>).'
    )
  }

  // --- emitente ---
  const emit = tags(infNFe, 'emit')[0]
  const fornecedor = (emit && (texto(emit, 'xFant') || texto(emit, 'xNome'))) || ''
  const cnpj = emit ? formatarCNPJ(texto(emit, 'CNPJ')) : null

  // --- identificacao ---
  const ide = tags(infNFe, 'ide')[0]
  const nf_numero = ide ? texto(ide, 'nNF') : null
  const serie = ide ? texto(ide, 'serie') : null
  const emissao = ide ? texto(ide, 'dhEmi') || texto(ide, 'dEmi') : null
  const data_emissao = emissao ? emissao.slice(0, 10) : null

  // --- chave de acesso (44 digitos) ---
  const idAttr = infNFe.getAttribute('Id') || ''
  const chave = idAttr.replace(/\D/g, '').slice(-44) || texto(doc, 'chNFe')

  // --- itens ---
  const itens: ItemNFe[] = tags(infNFe, 'det')
    .map((det) => {
      const prod = tags(det, 'prod')[0]
      if (!prod) return null
      const material = texto(prod, 'xProd') || 'Item sem descrição'
      const unidade = (texto(prod, 'uCom') || texto(prod, 'uTrib') || 'un').toLowerCase()
      const quantidade = numero(prod, 'qCom') || numero(prod, 'qTrib')
      const vUnCom = numero(prod, 'vUnCom') || numero(prod, 'vUnTrib')
      const vProd = numero(prod, 'vProd')
      // alguns emissores mandam valor unitario com muitas casas; se faltar, deriva do total
      const valor_unit = vUnCom > 0 ? vUnCom : quantidade > 0 ? vProd / quantidade : 0
      return {
        material: material.replace(/\s+/g, ' ').trim(),
        unidade,
        quantidade: arredondar(quantidade, 3),
        valor_unit: arredondar(valor_unit, 4),
      }
    })
    .filter((i): i is ItemNFe => i !== null && i.quantidade > 0)

  if (itens.length === 0) {
    throw new Error('A NF-e foi lida, mas nenhum item de produto foi encontrado nela.')
  }

  // --- totais ---
  const icmsTot = tags(infNFe, 'ICMSTot')[0]
  const valor_total = icmsTot ? numero(icmsTot, 'vNF') : 0
  const valor_itens = arredondar(
    itens.reduce((s, i) => s + i.quantidade * i.valor_unit, 0),
    2
  )

  return {
    fornecedor,
    cnpj,
    nf_numero,
    serie,
    data_emissao,
    valor_total: valor_total || valor_itens,
    valor_itens,
    chave: chave && chave.length === 44 ? chave : null,
    itens,
  }
}
