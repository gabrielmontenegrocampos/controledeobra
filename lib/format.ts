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

export const LABEL_TIPO_OCORRENCIA: Record<string, string> = {
  problema: 'Problema',
  desvio: 'Desvio',
  observacao: 'Observação',
}
