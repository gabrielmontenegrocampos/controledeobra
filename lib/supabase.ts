import { createClient } from '@supabase/supabase-js'

const PLACEHOLDER = 'https://placeholder.supabase.co'

/**
 * Limpa e valida a URL vinda da variavel de ambiente.
 * Se o valor estiver vazio ou mal formado (colado sem https://, com espaco
 * ou quebra de linha), cai no placeholder em vez de derrubar o build.
 */
function urlValida(valor: string | undefined) {
  const limpo = (valor || '').trim().replace(/\/+$/, '')
  if (!limpo) return null
  try {
    const u = new URL(limpo)
    return u.protocol === 'https:' || u.protocol === 'http:' ? limpo : null
  } catch {
    return null
  }
}

const url = urlValida(process.env.NEXT_PUBLIC_SUPABASE_URL)
const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

/** false quando as variaveis de ambiente estao ausentes ou invalidas */
export const supabaseConfigurado = Boolean(url && key)

export const supabase = createClient(url || PLACEHOLDER, key || 'placeholder-anon-key')

export const BUCKET = 'anexos'

/**
 * Traduz o erro do banco para algo acionavel.
 * Coluna ou tabela que nao existe quase sempre quer dizer que falta
 * rodar uma migracao nova no Supabase.
 */
export function mensagemErro(e: { code?: string; message: string } | null | undefined): string {
  if (!e) return ''
  const faltaMigracao = ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(e.code || '')
  if (faltaMigracao) {
    return `O banco está desatualizado (${e.message}). Abra o SQL Editor do Supabase e rode o arquivo supabase/schema.sql — ele é idempotente e aplica tudo o que falta.`
  }
  return e.message
}

/** Apaga do bucket um arquivo a partir da sua URL publica */
export async function removerArquivo(urlPublica: string) {
  const marca = `/object/public/${BUCKET}/`
  const i = urlPublica.indexOf(marca)
  if (i === -1) return
  const caminho = decodeURIComponent(urlPublica.slice(i + marca.length))
  await supabase.storage.from(BUCKET).remove([caminho])
}

/** Envia um arquivo para o bucket e devolve a URL publica */
export async function enviarArquivo(file: File, pasta: string) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const nome = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(nome, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome)
  return data.publicUrl
}
