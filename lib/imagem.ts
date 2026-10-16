/**
 * Prepara a foto antes de subir.
 *
 * Duas razoes:
 * 1. HEIC do iPhone nao abre em navegador nenhum fora do Safari. No proprio
 *    iPhone o Safari decodifica, entao a conversao feita aqui resolve.
 * 2. Foto de celular tem 3 a 4 MB. Reduzida fica com menos de 1 MB, sobe
 *    muito mais rapido no 4G da obra e ocupa menos espaco.
 */
const LADO_MAXIMO = 2400
const QUALIDADE = 0.82

export function ehHeic(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type)
}

export async function prepararImagem(file: File): Promise<{ arquivo: File; aviso?: string }> {
  const ehImagem = file.type.startsWith('image/') || ehHeic(file)
  if (!ehImagem) return { arquivo: file }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
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

    const blob = await new Promise<Blob | null>((ok) =>
      tela.toBlob(ok, 'image/jpeg', QUALIDADE)
    )
    if (!blob) throw new Error('sem blob')

    // se nao ganhou nada e ja era um formato que o navegador abre, fica o original
    if (blob.size >= file.size && !ehHeic(file)) return { arquivo: file }

    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return { arquivo: new File([blob], nome, { type: 'image/jpeg' }) }
  } catch {
    if (ehHeic(file)) {
      return {
        arquivo: file,
        aviso: `"${file.name}" está em HEIC, formato que só o Safari abre — ela foi guardada, mas pode não aparecer. No iPhone: Ajustes › Câmera › Formatos › Mais compatível.`,
      }
    }
    return { arquivo: file }
  }
}
