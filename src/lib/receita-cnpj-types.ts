export type ConsultaCnpjResult = {
  cnpj: string
  razaoSocial: string | null
  nomeFantasia: string | null
  endereco: string | null
  /** Preenchidos quando a API devolve campos separados (ReceitaWS / CNPJ.ws) */
  logradouro?: string | null
  numero?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
  emailEmpresa: string | null
  telefone: string | null
  cnae: string | null
  cnaeDescricao: string | null
  cnaeSecundarios: string[]
  statusReceita: string
  source: 'mock' | 'api' | 'cnpjws' | 'receitaws'
}
