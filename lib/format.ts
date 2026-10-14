/** Formatacao e parsing em padrao brasileiro */

export function brl(v: number | null | undefined) {
  return (Number(v) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function num(v: number | null | undefined, casas = 2) {
  return (Number(v) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

export function pct(v: number | null | undefined) {
  return `${num(v, 1)}%`
}

/** "1.234,56" | "1234.56" | "R$ 1.234,56"  ->  1234.56 */
export function parseMoeda(s: string): number {
  if (!s) return 0
  const limpo = s.replace(/[^\d,.-]/g, '')
  // se tem virgula, ela e o separador decimal
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo
  const n = parseFloat(normalizado)
  return isNaN(n) ? 0 : n
}

/** Como num(), mas sem os zeros sobrando no fim: 12,500 -> "12,5" */
export function numEnxuto(v: number | null | undefined, max = 3) {
  const n = Number(v) || 0
  const s = num(n, max)
  return s.includes(',') ? s.replace(/,?0+$/, '') : s
}

/** Deixa passar so o que pode existir num numero enquanto a pessoa digita */
export function limparNumerico(s: string) {
  return s.replace(/[^\d.,]/g, '')
}

export function apenasDigitos(s: string) {
  return s.replace(/\D/g, '')
}

export function dataBR(iso: string | null | undefined) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function hoje() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export function mesBR(mes: string) {
  const [a, m] = mes.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(m) - 1]}/${a.slice(2)}`
}

export const LABEL_TIPO: Record<string, string> = {
  material: 'Material',
  mao_de_obra: 'Mão de obra',
  servico: 'Serviço',
  taxa: 'Taxa',
  outro: 'Outro',
}

export const LABEL_CASA: Record<string, string> = {
  casa_01: 'Casa 01',
  casa_02: 'Casa 02',
  comum: 'Comum',
}

export const LABEL_CLIMA: Record<string, string> = {
  sol: 'Sol',
  nublado: 'Nublado',
  chuva: 'Chuva',
  tempestade: 'Tempestade',
  ventoso: 'Ventoso',
}

export const LABEL_SEVERIDADE: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
}

export const LABEL_CATEGORIA: Record<string, string> = {
  projeto: 'Projeto',
  contrato: 'Contrato',
  alvara: 'Alvará / Licença',
  art_rrt: 'ART / RRT',
  orcamento: 'Orçamento',
  memorial: 'Memorial / Especificação',
  nota: 'Nota fiscal',
  outros: 'Outros',
}

/** 1536000 -> "1,5 MB" */
export function tamanhoArquivo(bytes: number | null | undefined) {
  const b = Number(bytes) || 0
  if (b === 0) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${num(b / 1024, 0)} KB`
  return `${num(b / (1024 * 1024), 1)} MB`
}

export const LABEL_TIPO_OCORRENCIA: Record<string, string> = {
  problema: 'Problema',
  desvio: 'Desvio',
  observacao: 'Observação',
}
