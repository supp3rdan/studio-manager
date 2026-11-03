import type { Agendamento } from "@/types/database";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Format currency BRL */
function brl(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** Format datetime */
function dt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

/** Format date only */
function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

export async function generateAgendamentosPDF(
  agendamentos: Agendamento[]
): Promise<void> {
  // Dynamic import to avoid SSR issues
  const jsPDFModule = await import("jspdf");
  const jsPDF = jsPDFModule.default;
  await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // ── Colors ──────────────────────────────────────────────────────────────
  const GOLD = [201, 168, 76] as [number, number, number];
  const DARK = [18, 18, 18] as [number, number, number];
  const SURFACE = [28, 28, 28] as [number, number, number];
  const MUTED = [120, 120, 120] as [number, number, number];
  const WHITE = [255, 255, 255] as [number, number, number];

  // ── Header background ────────────────────────────────────────────────────
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 297, 297, "F");

  // Top bar
  doc.setFillColor(...SURFACE);
  doc.rect(0, 0, 297, 32, "F");

  // Gold accent line
  doc.setFillColor(...GOLD);
  doc.rect(0, 32, 297, 1.2, "F");

  // Logo area circle
  doc.setFillColor(201, 168, 76, 30);
  doc.circle(20, 16, 8, "F");
  doc.setTextColor(...GOLD);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("✦", 17, 17.5);

  // Title
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.text("Studio Manager", 32, 13);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text("Relatório de Agendamentos", 32, 20);

  // Date generated
  const now = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Gerado em: ${now}`, 297 - 14, 13, { align: "right" });
  doc.text(`Total: ${agendamentos.length} agendamento${agendamentos.length !== 1 ? "s" : ""}`, 297 - 14, 20, { align: "right" });

  // ── Summary KPIs ─────────────────────────────────────────────────────────
  const concluidos = agendamentos.filter((a) => a.status === "Concluído");
  const pendentes = agendamentos.filter(
    (a) => a.status === "Agendado" || a.status === "Confirmado"
  );
  const totalFaturado = concluidos.reduce((s, a) => s + (a.valor_final ?? 0), 0);
  const totalPrevisto = pendentes.reduce((s, a) => s + (a.valor_final ?? 0), 0);

  const kpis = [
    { label: "Faturado (Concluídos)", value: brl(totalFaturado) },
    { label: "Previsto (Pendentes)", value: brl(totalPrevisto) },
    { label: "Concluídos", value: String(concluidos.length) },
    { label: "Pendentes", value: String(pendentes.length) },
  ];

  const cardW = 60;
  const cardH = 16;
  const cardY = 37;
  const cardStartX = 14;
  const cardGap = 4;

  kpis.forEach((kpi, i) => {
    const x = cardStartX + i * (cardW + cardGap);
    doc.setFillColor(...SURFACE);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, "F");
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, "S");

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(kpi.label, x + 4, cardY + 5);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GOLD);
    doc.text(kpi.value, x + 4, cardY + 12);
  });

  // ── Table ─────────────────────────────────────────────────────────────────
  const tableStartY = cardY + cardH + 6;

  const rows = agendamentos.map((a) => [
    dt(a.data_hora),
    a.clientes?.nome ?? "—",
    a.clientes?.whatsapp ?? "—",
    a.servicos?.nome ?? "—",
    a.servicos?.categoria ?? "—",
    brl(a.valor_final),
    a.forma_pagamento ?? "—",
    a.status,
    a.local,
    a.observacoes ?? "—",
  ]);

  function statusColor(status: string): [number, number, number] {
    const map: Record<string, [number, number, number]> = {
      Agendado: [96, 165, 250],
      Confirmado: [52, 211, 153],
      Concluído: [201, 168, 76],
      Cancelado: [248, 113, 113],
      "Não Compareceu": [251, 146, 60],
    };
    return map[status] ?? [120, 120, 120];
  }

  // @ts-ignore — jspdf-autotable augments jsPDF prototype
  doc.autoTable({
    startY: tableStartY,
    head: [[
      "Data / Hora",
      "Cliente",
      "WhatsApp",
      "Serviço",
      "Categoria",
      "Valor",
      "Pagamento",
      "Status",
      "Local",
      "Observações",
    ]],
    body: rows,
    theme: "plain",
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      textColor: WHITE,
      lineColor: [40, 40, 40],
      lineWidth: 0.2,
      font: "helvetica",
    },
    headStyles: {
      fillColor: SURFACE,
      textColor: GOLD,
      fontStyle: "bold",
      fontSize: 7.5,
      lineColor: GOLD,
      lineWidth: { bottom: 0.5 },
    },
    alternateRowStyles: {
      fillColor: [22, 22, 22],
    },
    bodyStyles: {
      fillColor: DARK,
    },
    columnStyles: {
      0: { cellWidth: 30 },   // Data
      1: { cellWidth: 30 },   // Cliente
      2: { cellWidth: 25 },   // WhatsApp
      3: { cellWidth: 30 },   // Serviço
      4: { cellWidth: 22 },   // Categoria
      5: { cellWidth: 22 },   // Valor
      6: { cellWidth: 22 },   // Pagamento
      7: { cellWidth: 24 },   // Status
      8: { cellWidth: 18 },   // Local
      9: { cellWidth: "auto" }, // Observações
    },
    didDrawCell: (data: any) => {
      // Color the Status column cell text
      if (data.section === "body" && data.column.index === 7) {
        const status = data.cell.raw as string;
        const [r, g, b] = statusColor(status);
        doc.setTextColor(r, g, b);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        const textX = data.cell.x + 3;
        const textY = data.cell.y + data.cell.height / 2 + 2.5;
        doc.text(status, textX, textY);
      }
    },
    margin: { left: 14, right: 14 },
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...SURFACE);
    doc.rect(0, pageH - 10, 297, 10, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text("Studio Manager — Relatório confidencial", 14, pageH - 4);
    doc.text(`Página ${i} de ${pageCount}`, 297 - 14, pageH - 4, { align: "right" });
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const filename = `relatorio-agendamentos-${format(new Date(), "yyyy-MM-dd")}.pdf`;
  doc.save(filename);
}
