/** Soma meses a uma data ISO, segurando o dia no fim do mes curto.
 *  31/01 + 1 mes = 28/02 (ou 29 em ano bissexto). */
export function somarMeses(iso: string, meses: number) {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1))
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const d = Math.min(dia, ultimoDia)
  return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export type Parcela = { numero: number; vencimento: string; valor: number }

/**
 * Divide o que sobra depois da entrada em parcelas iguais.
 * A sobra dos centavos vai toda na ultima parcela, entao a soma
 * das parcelas mais a entrada fecha exatamente o valor total.
 */
export function gerarParcelas(opcoes: {
  valorTotal: number
  entrada: number
  quantidade: number
  primeiroVencimento: string
}): Parcela[] {
  const { valorTotal, entrada, quantidade, primeiroVencimento } = opcoes
  if (quantidade < 1) return []

  const restante = Math.round((valorTotal - entrada) * 100) / 100
  if (restante <= 0) return []

  const centavos = Math.round(restante * 100)
  const base = Math.floor(centavos / quantidade)
  const sobra = centavos - base * quantidade

  return Array.from({ length: quantidade }, (_, i) => ({
    numero: i + 1,
    vencimento: somarMeses(primeiroVencimento, i),
    valor: (i === quantidade - 1 ? base + sobra : base) / 100,
  }))
}

/** Valor "cheio" de cada parcela, so para mostrar na tela antes de gerar */
export function valorParcela(valorTotal: number, entrada: number, quantidade: number) {
  if (quantidade < 1) return 0
  const restante = Math.round((valorTotal - entrada) * 100) / 100
  return Math.round((restante / quantidade) * 100) / 100
}
