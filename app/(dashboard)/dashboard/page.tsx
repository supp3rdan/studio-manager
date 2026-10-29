"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, CalendarCheck, Clock, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { PaymentChart } from "@/components/dashboard/payment-chart";
import {
  getDashboardMetrics,
  getFaturamentoMensal,
  getPagamentoPorMetodo,
} from "@/lib/queries/agendamentos";
import { formatCurrency } from "@/lib/utils";
import type {
  DashboardMetrics,
  FaturamentoMensal,
  PagamentoPorMetodo,
} from "@/types/database";

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [faturamento, setFaturamento] = useState<FaturamentoMensal[]>([]);
  const [pagamentos, setPagamentos] = useState<PagamentoPorMetodo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [m, f, p] = await Promise.all([
        getDashboardMetrics(),
        getFaturamentoMensal(),
        getPagamentoPorMetodo(),
      ]);
      setMetrics(m);
      setFaturamento(f);
      setPagamentos(p);
    } catch {
      toast.error("Erro ao carregar métricas");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Visão financeira e operacional em tempo real
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Faturamento Realizado"
          value={metrics ? formatCurrency(metrics.faturamentoRealizado) : "—"}
          description='Agendamentos com status "Concluído"'
          icon={<DollarSign className="w-5 h-5" />}
          isLoading={isLoading}
          highlight
        />
        <MetricCard
          title="Faturamento Previsto"
          value={metrics ? formatCurrency(metrics.faturamentoPrevisto) : "—"}
          description='Status "Agendado" e "Confirmado"'
          icon={<TrendingUp className="w-5 h-5" />}
          isLoading={isLoading}
        />
        <MetricCard
          title="Atendimentos Concluídos"
          value={metrics ? String(metrics.atendimentosConcluidos) : "—"}
          description="Total de serviços realizados"
          icon={<CalendarCheck className="w-5 h-5" />}
          isLoading={isLoading}
        />
        <MetricCard
          title="Agendamentos Pendentes"
          value={metrics ? String(metrics.agendamentosPendentes) : "—"}
          description="Agendados + Confirmados"
          icon={<Clock className="w-5 h-5" />}
          isLoading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">
                Faturamento — Últimos 6 meses
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <RevenueChart data={faturamento} isLoading={isLoading} />
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">
                Receita por Método de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <PaymentChart data={pagamentos} isLoading={isLoading} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
