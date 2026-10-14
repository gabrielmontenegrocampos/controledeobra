import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const NAVY: [number, number, number] = [31, 58, 95]

export type Resumo = { rotulo: string; valor: string }

export function exportarPDF(opcoes: {
  titulo: string
  subtitulo?: string
  colunas: string[]
  linhas: (string | number)[][]
  resumo?: Resumo[]
  alinharDireita?: number[]
  paisagem?: boolean
  arquivo?: string
}) {
  const {
    titulo,
    subtitulo,
    colunas,
    linhas,
    resumo = [],
    alinharDireita = [],
    paisagem = false,
    arquivo,
  } = opcoes

  const doc = new jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm' })
  const largura = doc.internal.pageSize.getWidth()

  doc.setFillColor(...NAVY)
  doc.rect(0, 0, largura, 26, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.text(titulo, 14, 12)
  doc.setFontSize(9)
  doc.text('Obra Lagoa Santa — Rua Sabiá, 130 e 132', 14, 19)
  doc.text(
    `Emitido em ${new Date().toLocaleString('pt-BR')}`,
    largura - 14,
    19,
    { align: 'right' }
  )

  let y = 34
  doc.setTextColor(40, 40, 40)
  if (subtitulo) {
    doc.setFontSize(10)
    doc.text(subtitulo, 14, y)
    y += 7
  }

  if (resumo.length) {
    doc.setFontSize(9)
    const porLinha = paisagem ? 4 : 3
    resumo.forEach((r, i) => {
      const col = i % porLinha
      const linha = Math.floor(i / porLinha)
      const x = 14 + col * ((largura - 28) / porLinha)
      const yy = y + linha * 12
      doc.setTextColor(110, 110, 110)
      doc.text(r.rotulo.toUpperCase(), x, yy)
      doc.setTextColor(20, 20, 20)
      doc.setFontSize(11)
      doc.text(r.valor, x, yy + 5)
      doc.setFontSize(9)
    })
    y += Math.ceil(resumo.length / porLinha) * 12 + 4
  }

  const estiloColunas: Record<number, { halign: 'right' }> = {}
  alinharDireita.forEach((i) => (estiloColunas[i] = { halign: 'right' }))

  autoTable(doc, {
    head: [colunas],
    body: linhas.map((l) => l.map((c) => String(c))),
    startY: y,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: estiloColunas,
    margin: { left: 14, right: 14 },
  })

  doc.save(`${arquivo || titulo.toLowerCase().replace(/\s+/g, '-')}.pdf`)
}

export function exportarXLSX(
  arquivo: string,
  abas: { nome: string; colunas: string[]; linhas: (string | number)[][] }[]
) {
  const wb = XLSX.utils.book_new()
  abas.forEach((aba) => {
    const ws = XLSX.utils.aoa_to_sheet([aba.colunas, ...aba.linhas])
    ws['!cols'] = aba.colunas.map((c) => ({ wch: Math.max(12, Math.min(40, c.length + 6)) }))
    XLSX.utils.book_append_sheet(wb, ws, aba.nome.slice(0, 31))
  })
  XLSX.writeFile(wb, `${arquivo}.xlsx`)
}
