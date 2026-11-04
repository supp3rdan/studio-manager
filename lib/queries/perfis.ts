import { createClient } from "@/lib/supabase/client";
import type { Perfil, Servico, Agendamento } from "@/types/database";

export async function getPerfilAtual(): Promise<Perfil | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("perfis")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    // Se o perfil ainda não existir na tabela (ex: usuário criado antes do trigger), cria agora
    if (error.code === "PGRST116") {
      const nomePadrao =
        user.user_metadata?.nome || user.email?.split("@")[0] || "Profissional";
      const tipo = user.user_metadata?.tipo_usuario || "profissional";
      const codigo =
        tipo === "profissional"
          ? String(Math.floor(1000 + Math.random() * 9000))
          : null;

      const { data: newPerfil, error: insertError } = await supabase
        .from("perfis")
        .insert({
          id: user.id,
          tipo_usuario: tipo,
          nome: nomePadrao,
          whatsapp: user.user_metadata?.whatsapp || null,
          nome_studio: user.user_metadata?.nome_studio || null,
          codigo_profissional: codigo,
          email: user.email,
        })
        .select()
        .single();

      if (!insertError && newPerfil) {
        return newPerfil as Perfil;
      }
    }
    return null;
  }

  return data as Perfil;
}

export async function updatePerfilAtual(
  payload: Partial<Pick<Perfil, "nome" | "whatsapp" | "nome_studio">>
): Promise<Perfil> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data, error } = await supabase
    .from("perfis")
    .update({ ...payload, atualizado_em: new Date().toISOString() })
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data as Perfil;
}

export async function getProfissionalByCodigo(
  codigo: string
): Promise<Perfil | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("perfis")
    .select("*")
    .eq("codigo_profissional", codigo.trim())
    .eq("tipo_usuario", "profissional")
    .single();

  if (error || !data) return null;
  return data as Perfil;
}

export async function getServicosDoProfissional(
  userId: string
): Promise<Servico[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("servicos")
    .select("*")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("categoria", { ascending: true })
    .order("nome", { ascending: true });

  if (error) throw error;
  return (data as Servico[]) ?? [];
}

export async function getAgendamentosDoCliente(): Promise<Agendamento[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("agendamentos")
    .select(
      `
      *,
      servicos ( id, nome, categoria, preco_base )
    `
    )
    .eq("cliente_user_id", user.id)
    .order("data_hora", { ascending: false });

  if (error) throw error;

  // Busca dados dos profissionais vinculados aos agendamentos
  const agendamentos = (data as Agendamento[]) ?? [];
  if (agendamentos.length === 0) return [];

  const userIds = Array.from(new Set(agendamentos.map((a) => a.user_id)));
  const { data: perfisProfissionais } = await supabase
    .from("perfis")
    .select("id, nome, nome_studio, whatsapp, codigo_profissional")
    .in("id", userIds);

  const perfisMap = new Map((perfisProfissionais ?? []).map((p) => [p.id, p]));

  return agendamentos.map((ag) => ({
    ...ag,
    profissional: perfisMap.get(ag.user_id),
  }));
}

