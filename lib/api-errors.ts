import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * Mapeia códigos de erro do Postgres (vindos das RPCs) para status HTTP.
 * As RPCs da migration 012 usam ERRCODEs específicos para cada situação.
 */
const PG_STATUS: Record<string, number> = {
  "28000": 401, // não autenticado
  "42501": 403, // sem permissão
  P0002: 404, // não encontrado
  "23P01": 409, // conflito de horário
  "22023": 400, // dado inválido
  P0001: 400, // RAISE EXCEPTION genérico (versões antigas das RPCs)
};

export function rpcErrorResponse(
  error: { code?: string; message?: string },
  fallbackMessage: string
) {
  const status = (error.code && PG_STATUS[error.code]) || 500;
  if (status === 500) {
    console.error("[RPC error]", error);
    return NextResponse.json({ error: fallbackMessage }, { status });
  }
  return NextResponse.json({ error: error.message || fallbackMessage }, { status });
}

export function validationErrorResponse(error: ZodError) {
  const first = error.issues[0];
  return NextResponse.json(
    { error: first?.message || "Dados inválidos." },
    { status: 400 }
  );
}

/** PostgREST: função inexistente no schema cache (migration ainda não aplicada). */
export function isMissingFunction(error: { code?: string } | null | undefined) {
  return !!error && (error.code === "PGRST202" || error.code === "42883");
}
