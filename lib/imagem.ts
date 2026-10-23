/**
 * Prepara a foto antes de subir.
 *
 * Duas razoes:
 * 1. HEIC do iPhone nao abre em navegador nenhum fora do Safari. Aqui ele e
 *    decodificado por uma biblioteca propria (carregada so quando aparece um
 *    HEIC) e vira JPEG, entao a foto funciona em qualquer aparelho.
 * 2. Foto de celular tem 3 a 4 MB. Reduzida fica com menos de 1 MB, sobe
 *    muito mais rapido no 4G da obra e ocupa menos espaco.
 */
const LADO_MAXIMO = 2400
const QUALIDADE = 0.82

export function ehHeic(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type)
}

/** Decodifica o arquivo, usando o conversor de HEIC quando precisar */
async function paraBitmap(file: File): Promise<ImageBitmap> {
  if (ehHeic(file)) {
    const { heicTo } = await import('heic-to')
    return (await heicTo({ blob: file, type: 'bitmap' })) as ImageBitmap
  }
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // alguns aparelhos mandam HEIC com nome e tipo de JPEG
    const { isHeic, heicTo } = await import('heic-to')
    if (await isHeic(file)) {
      return (await heicTo({ blob: file, type: 'bitmap' })) as ImageBitmap
    }
    throw new Error('formato de imagem não reconhecido')
  }
}

export async function prepararImagem(file: File): Promise<{ arquivo: File; aviso?: string }> {
  const ehImagem = file.type.startsWith('image/') || ehHeic(file)
  if (!ehImagem) return { arquivo: file }

  try {
    const bitmap = await paraBitmap(file)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    const largura = Math.round(bitmap.width * escala)
    const altura = Math.round(bitmap.height * escala)

    const tela = document.createElement('canvas')
    tela.width = largura
    tela.height = altura
    const ctx = tela.getContext('2d')
    if (!ctx) throw new Error('sem canvas')
    ctx.drawImage(bitmap, 0, 0, largura, altura)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', QUALIDADE))
    if (!blob) throw new Error('sem blob')

    // se nao ganhou nada e ja era um formato que o navegador abre, fica o original
    if (blob.size >= file.size && !ehHeic(file)) return { arquivo: file }

    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return { arquivo: new File([blob], nome, { type: 'image/jpeg' }) }
  } catch (e) {
    return {
      arquivo: file,
      aviso: `Não consegui converter "${file.name}" (${
        e instanceof Error ? e.message : 'erro desconhecido'
      }). A foto foi guardada, mas pode não aparecer. Se for do iPhone: Ajustes › Câmera › Formatos › Mais compatível.`,
    }
  }
}
