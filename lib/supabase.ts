import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** false quando as variaveis de ambiente nao foram configuradas ainda */
export const supabaseConfigurado = Boolean(url && key)

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key'
)

export const BUCKET = 'anexos'

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
