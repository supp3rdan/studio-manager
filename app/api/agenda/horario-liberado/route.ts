import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { notificarListaEspera } from "@/lib/lista-espera";

const bodySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Chamado pelo painel do profissional quando um horário é liberado
 * (cancelamento, falta, exclusão ou mudança de data). Avisa a lista de espera
 * daquele dia, se houver vaga para o serviço de cada cliente.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("perfis")
    .select("tipo_usuario")
    .eq("id", user.id)
    .maybeSingle();
  if (perfil?.tipo_usuario !== "profissional") {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const avisadas = await notificarListaEspera(user.id, parsed.data.data);
  return NextResponse.json({ success: true, avisadas });
}
