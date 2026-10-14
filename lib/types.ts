export type Casa = 'casa_01' | 'casa_02' | 'comum'
export type TipoLancamento = 'material' | 'mao_de_obra' | 'servico' | 'taxa' | 'outro'
export type StatusLancamento = 'pago' | 'a_pagar'

export type Obra = {
  id: string
  nome: string
  endereco: string | null
  area_m2: number | null
  data_inicio: string | null
  data_previsao_fim: string | null
  observacao: string | null
}

export type Etapa = {
  id: string
  nome: string
  grupo: string | null
  valor_previsto: number
  perc_avanco: number
  ordem: number
  etapa_pai_id: string | null
}

export type EtapaResumo = Etapa & {
  realizado: number
  pago: number
  a_pagar: number
  saldo: number
  perc_financeiro: number | null
}

export type Investidor = {
  id: string
  nome: string
  observacao: string | null
}

export type InvestidorResumo = {
  id: string
  nome: string
  total_aportado: number
  qtd_aportes: number
  ultimo_aporte: string | null
  perc_participacao: number
}

export type Aporte = {
  id: string
  investidor_id: string
  data: string
  valor: number
  forma: string | null
  observacao: string | null
  comprovante_url: string | null
  investidores?: { nome: string } | null
}

export type ItemLancamento = {
  id?: string
  lancamento_id?: string
  material: string
  unidade: string | null
  quantidade: number
  valor_unit: number
}

export type Lancamento = {
  id: string
  etapa_id: string | null
  tipo: TipoLancamento
  casa: Casa
  fornecedor: string | null
  descricao: string | null
  nf_numero: string | null
  data_emissao: string
  data_pagamento: string | null
  valor: number
  status: StatusLancamento
  forma_pagamento: string | null
  nf_url: string | null
  comprovante_url: string | null
  etapas?: { nome: string } | null
  itens_lancamento?: ItemLancamento[]
}

export type MaterialResumo = {
  material: string
  chave: string
  unidade: string
  qtd_total: number
  valor_total: number
  preco_medio: number
  menor_preco: number
  maior_preco: number
  qtd_compras: number
  ultima_compra: string | null
}

export type CaixaResumo = {
  total_aportado: number
  total_pago: number
  total_a_pagar: number
  saldo: number
}

export type CasasResumo = {
  custo_casa_01: number
  custo_casa_02: number
  custo_comum: number
  custo_total: number
}

export type GastoMensal = {
  mes: string
  total: number
  materiais: number
  mao_de_obra: number
  outros: number
}

export type CategoriaArquivo =
  | 'projeto'
  | 'contrato'
  | 'alvara'
  | 'art_rrt'
  | 'orcamento'
  | 'memorial'
  | 'nota'
  | 'outros'

export type Arquivo = {
  id: string
  nome: string
  categoria: CategoriaArquivo
  descricao: string | null
  url: string
  tipo_arquivo: string | null
  tamanho: number | null
  data_referencia: string | null
  created_at: string
}

export type Registro = {
  id: string
  data: string
  descricao: string | null
  clima: string | null
  temperatura: number | null
  fotos?: Foto[]
  equipe_dia?: EquipeDia[]
  ocorrencias?: Ocorrencia[]
}

export type Foto = { id?: string; registro_id?: string; url: string; legenda: string | null }
export type EquipeDia = { id?: string; registro_id?: string; nome: string; funcao: string | null; horas: number | null }
export type Ocorrencia = {
  id?: string
  registro_id?: string
  descricao: string
  tipo: 'problema' | 'desvio' | 'observacao'
  severidade: 'baixa' | 'media' | 'alta'
}
