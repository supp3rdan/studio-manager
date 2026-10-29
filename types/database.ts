export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CategoriaServico = "Cílios" | "Sobrancelhas" | "Depilação";
export type TipoServico = "Tabela Padrão" | "Promoção";
export type StatusAgendamento =
  | "Agendado"
  | "Confirmado"
  | "Concluído"
  | "Cancelado"
  | "Não Compareceu";
export type FormaPagamento =
  | "Pix"
  | "Cartão Débito"
  | "Cartão Crédito"
  | "Crédito Bemol"
  | "Dinheiro";
export type LocalAgendamento = "Studio" | "Domicílio";

export interface Cliente {
  id: string;
  user_id: string;
  nome: string;
  whatsapp: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Servico {
  id: string;
  user_id: string;
  categoria: CategoriaServico;
  nome: string;
  preco_base: number;
  tipo: TipoServico;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Agendamento {
  id: string;
  user_id: string;
  cliente_id: string | null;
  servico_id: string | null;
  data_hora: string;
  valor_final: number | null;
  forma_pagamento: FormaPagamento | null;
  status: StatusAgendamento;
  local: LocalAgendamento;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  // Joined fields
  clientes?: Pick<Cliente, "id" | "nome" | "whatsapp">;
  servicos?: Pick<Servico, "id" | "nome" | "categoria" | "preco_base">;
}

// Dashboard types
export interface DashboardMetrics {
  faturamentoRealizado: number;
  faturamentoPrevisto: number;
  atendimentosConcluidos: number;
  agendamentosPendentes: number;
}

export interface FaturamentoMensal {
  mes: string;
  valor: number;
}

export interface PagamentoPorMetodo {
  metodo: FormaPagamento;
  valor: number;
  count: number;
}
