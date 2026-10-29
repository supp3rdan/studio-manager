"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { PagamentoPorMetodo } from "@/types/database";

const COLORS = [
  "#C9A84C",
  "#E8C97A",
  "#7A6030",
  "#4A3A1A",
  "#D4A853",
];

interface PaymentChartProps {
  data: PagamentoPorMetodo[];
  isLoading?: boolean;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const item = payload[0];
    return (
      <div className="bg-[#1A1A1A] border border-[#222] rounded-lg p-3 shadow-xl">
        <p className="text-xs font-semibold text-foreground mb-1">{item.name}</p>
        <p className="text-sm text-[#C9A84C]">{formatCurrency(item.value)}</p>
        <p className="text-xs text-muted-foreground">{item.payload.count} atendimento{item.payload.count !== 1 ? "s" : ""}</p>
      </div>
    );
  }
  return null;
};

export function PaymentChart({ data, isLoading }: PaymentChartProps) {
  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="w-48 h-48 rounded-full bg-white/5 animate-pulse" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        Sem dados de pagamento ainda
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="valor"
          nameKey="metodo"
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={3}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
              stroke="transparent"
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span className="text-xs text-muted-foreground">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
