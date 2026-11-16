export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TipoUsuario = "profissional" | "cliente";
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

/** Opções individuais de pagamento (também aceita combinações como "Pix + Dinheiro") */
export const FORMAS_PAGAMENTO: FormaPagamento[] = [
  "Pix",
  "Cartão Débito",
  "Cartão Crédito",
  "Crédito Bemol",
  "Dinheiro",
];
export type LocalAgendamento = "Studio" | "Domicílio";

export interface Perfil {
  id: string;
  tipo_usuario: TipoUsuario;
  nome: string;
  whatsapp: string | null;
  nome_studio: string | null;
  codigo_profissional: string | null;
  email: string | null;
  criado_em: string;
  atualizado_em: string;
}

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
  preco_promocional: number | null;
  promocao_ativa: boolean;
  duracao_minutos: number;
  tipo: TipoServico;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type TipoIndisponibilidade = "dia_inteiro" | "horario";

export interface Indisponibilidade {
  id: string;
  user_id: string;
  tipo: TipoIndisponibilidade;
  data_inicio: string;
  data_fim: string | null;
  titulo: string | null;
  recorrente: boolean;
  dia_semana: number | null;
  criado_em: string;
}

export interface Agendamento {
  id: string;
  user_id: string;
  cliente_id: string | null;
  cliente_user_id?: string | null;
  servico_id: string | null;
  data_hora: string;
  valor_final: number | null;
  forma_pagamento: string | null; // TEXT no banco — suporta pagamento misto ex: "Pix + Dinheiro"
  status: StatusAgendamento;
  local: LocalAgendamento;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  // Joined fields
  clientes?: Pick<Cliente, "id" | "nome" | "whatsapp">;
  servicos?: Pick<Servico, "id" | "nome" | "categoria" | "preco_base">;
  profissional?: Pick<Perfil, "id" | "nome" | "nome_studio" | "whatsapp" | "codigo_profissional">;
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
  metodo: string;
  valor: number;
  count: number;
}
