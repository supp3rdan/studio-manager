"use client";

import { useState, useCallback } from "react";
import { CreditCard, Check, X, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";

const OPCOES = [
  { key: "Pix", label: "Pix", emoji: "💸" },
  { key: "Cartão Débito", label: "Débito", emoji: "💳" },
  { key: "Cartão Crédito", label: "Crédito", emoji: "💳" },
  { key: "Crédito Bemol", label: "Bemol", emoji: "🏷️" },
  { key: "Dinheiro", label: "Dinheiro", emoji: "💵" },
] as const;

interface PaymentSelectorProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  /** Se true, mostra label menor (uso em modal cliente) */
  compact?: boolean;
}

/**
 * Seletor de forma de pagamento com suporte a pagamento misto.
 * Clique em um item para selecionar; clique novamente para desmarcar.
 * Combinações são separadas por " + ".
 */
export function PaymentSelector({ value, onChange, compact = false }: PaymentSelectorProps) {
  // Parse current selections from string value
  const selected = (value ?? "")
    .split(" + ")
    .map((s) => s.trim())
    .filter(Boolean);

  const toggle = useCallback(
    (key: string) => {
      let next: string[];
      if (selected.includes(key)) {
        next = selected.filter((s) => s !== key);
      } else {
        next = [...selected, key];
      }
      onChange(next.length > 0 ? next.join(" + ") : null);
    },
    [selected, onChange]
  );

  const clear = () => onChange(null);

  const isMixed = selected.length > 1;

  return (
    <div className="space-y-2">
      {/* Chips grid */}
      <div className="flex flex-wrap gap-2">
        {OPCOES.map(({ key, label, emoji }) => {
          const isActive = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                isActive
                  ? "border-[#C9A84C] bg-[#C9A84C] text-[#0A0A0A] shadow-sm shadow-[#C9A84C]/20"
                  : "border-border bg-background text-muted-foreground hover:border-[#C9A84C]/40 hover:text-foreground"
              )}
            >
              <span>{emoji}</span>
              {label}
              {isActive && <Check className="w-3 h-3" />}
            </button>
          );
        })}
      </div>

      {/* Preview do pagamento selecionado */}
      {selected.length > 0 && (
        <div
          className={cn(
            "flex items-center gap-2 p-2 rounded-lg border transition-all",
            isMixed
              ? "border-[#C9A84C]/30 bg-[#C9A84C]/5"
              : "border-border bg-background"
          )}
        >
          {isMixed && <Shuffle className="w-3.5 h-3.5 text-[#C9A84C] shrink-0" />}
          {!isMixed && <CreditCard className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          <span className={cn("text-xs font-medium flex-1", isMixed ? "text-[#C9A84C]" : "text-foreground")}>
            {isMixed ? `Pagamento misto: ${selected.join(" + ")}` : selected[0]}
          </span>
          <button
            type="button"
            onClick={clear}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {selected.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Selecione uma ou mais formas de pagamento.
        </p>
      )}
    </div>
  );
}
