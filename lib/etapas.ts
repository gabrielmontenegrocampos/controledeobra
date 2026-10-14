import type { EtapaResumo } from './types'

/**
 * Etapa com as filhas aninhadas e os totais ja somados.
 *
 * Regra: quem manda e a filha.
 * - Se a etapa tem subetapas, o previsto dela e a SOMA das subetapas
 *   (o valor digitado na mae passa a ser ignorado).
 * - O realizado e sempre o que ela mesma recebeu em lancamentos MAIS
 *   o realizado das filhas.
 * - O avanco da mae e a media das filhas ponderada pelo previsto de cada uma.
 */
export type NoEtapa = EtapaResumo & {
  filhas: NoEtapa[]
  nivel: number
  temFilhas: boolean
  previstoTotal: number
  realizadoTotal: number
  pagoTotal: number
  aPagarTotal: number
  avancoTotal: number
}

function construir(etapa: EtapaResumo, todas: EtapaResumo[], nivel: number): NoEtapa {
  const filhas = todas
    .filter((e) => e.etapa_pai_id === etapa.id)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
    .map((f) => construir(f, todas, nivel + 1))

  const temFilhas = filhas.length > 0

  const previstoTotal = temFilhas
    ? filhas.reduce((s, f) => s + f.previstoTotal, 0)
    : Number(etapa.valor_previsto) || 0

  const realizadoTotal =
    (Number(etapa.realizado) || 0) + filhas.reduce((s, f) => s + f.realizadoTotal, 0)
  const pagoTotal = (Number(etapa.pago) || 0) + filhas.reduce((s, f) => s + f.pagoTotal, 0)
  const aPagarTotal = (Number(etapa.a_pagar) || 0) + filhas.reduce((s, f) => s + f.aPagarTotal, 0)

  let avancoTotal = Number(etapa.perc_avanco) || 0
  if (temFilhas) {
    const base = filhas.reduce((s, f) => s + f.previstoTotal, 0)
    avancoTotal =
      base > 0
        ? filhas.reduce((s, f) => s + f.avancoTotal * f.previstoTotal, 0) / base
        : filhas.reduce((s, f) => s + f.avancoTotal, 0) / filhas.length
  }

  return {
    ...etapa,
    filhas,
    nivel,
    temFilhas,
    previstoTotal,
    realizadoTotal,
    pagoTotal,
    aPagarTotal,
    avancoTotal,
  }
}

/** So as etapas raiz, cada uma com as filhas dentro */
export function montarArvore(etapas: EtapaResumo[]): NoEtapa[] {
  const ids = new Set(etapas.map((e) => e.id))
  return etapas
    .filter((e) => !e.etapa_pai_id || !ids.has(e.etapa_pai_id))
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
    .map((e) => construir(e, etapas, 0))
}

/** A arvore virada em lista, na ordem em que aparece na tela */
export function achatar(arvore: NoEtapa[]): NoEtapa[] {
  return arvore.flatMap((n) => [n, ...achatar(n.filhas)])
}

export function totaisGerais(arvore: NoEtapa[]) {
  const previsto = arvore.reduce((s, n) => s + n.previstoTotal, 0)
  const realizado = arvore.reduce((s, n) => s + n.realizadoTotal, 0)
  const aPagar = arvore.reduce((s, n) => s + n.aPagarTotal, 0)
  const avanco =
    previsto > 0
      ? arvore.reduce((s, n) => s + n.avancoTotal * n.previstoTotal, 0) / previsto
      : 0
  return { previsto, realizado, aPagar, avanco }
}

/** "Estrutura › Pilares" para mostrar o caminho completo da subetapa */
export function nomeCompleto(etapas: { id: string; nome: string; etapa_pai_id?: string | null }[], id: string | null) {
  if (!id) return null
  const mapa = new Map(etapas.map((e) => [e.id, e]))
  const partes: string[] = []
  let atual = mapa.get(id)
  let guarda = 0
  while (atual && guarda++ < 10) {
    partes.unshift(atual.nome)
    atual = atual.etapa_pai_id ? mapa.get(atual.etapa_pai_id) : undefined
  }
  return partes.join(' › ')
}

/** O id informado mais o de todas as suas descendentes */
export function comDescendentes(
  etapas: { id: string; etapa_pai_id?: string | null }[],
  id: string
): string[] {
  const resultado = [id]
  const fila = [id]
  let guarda = 0
  while (fila.length && guarda++ < 500) {
    const atual = fila.shift()!
    etapas
      .filter((e) => e.etapa_pai_id === atual)
      .forEach((f) => {
        resultado.push(f.id)
        fila.push(f.id)
      })
  }
  return resultado
}
