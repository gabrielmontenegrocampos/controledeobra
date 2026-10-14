import { supabase } from './supabase'
import type { Fornecedor } from './types'

/**
 * Devolve o id do fornecedor, cadastrando se ainda nao existir.
 * Procura primeiro pelo CNPJ (quando veio do XML da nota) e depois
 * pelo nome, ignorando maiusculas e espacos nas pontas. E assim que
 * a lista de fornecedores vai se formando sozinha.
 */
export async function garantirFornecedor(
  nome: string,
  cnpj?: string | null
): Promise<string | null> {
  const limpo = nome.trim()
  if (!limpo) return null

  if (cnpj) {
    const { data } = await supabase
      .from('fornecedores')
      .select('id, nome')
      .eq('cnpj', cnpj)
      .maybeSingle()
    if (data?.id) return data.id
  }

  const { data: porNome } = await supabase
    .from('fornecedores')
    .select('id, cnpj')
    .ilike('nome', limpo)
    .maybeSingle()

  if (porNome?.id) {
    // completa o CNPJ se ele so apareceu agora, no XML
    if (cnpj && !porNome.cnpj) {
      await supabase.from('fornecedores').update({ cnpj }).eq('id', porNome.id)
    }
    return porNome.id
  }

  const { data: novo, error } = await supabase
    .from('fornecedores')
    .insert({ nome: limpo, cnpj: cnpj || null })
    .select('id')
    .single()

  if (error) {
    // corrida com outro cadastro do mesmo nome: busca de novo
    const { data } = await supabase
      .from('fornecedores')
      .select('id')
      .ilike('nome', limpo)
      .maybeSingle()
    return data?.id || null
  }

  return novo.id
}

export async function listarFornecedores(): Promise<Fornecedor[]> {
  const { data } = await supabase.from('fornecedores').select('*').order('nome')
  return (data as Fornecedor[]) || []
}
