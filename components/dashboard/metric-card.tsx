import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  isLoading?: boolean;
  highlight?: boolean;
}

export function MetricCard({
  title,
  value,
  description,
  icon,
  isLoading,
  highlight,
}: MetricCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-200 hover:border-[#C9A84C]/30",
        highlight && "border-[#C9A84C]/20"
      )}
    >
      {highlight && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#C9A84C]/5 to-transparent pointer-events-none" />
      )}
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div
            className={cn(
              "p-2 rounded-lg",
              highlight
                ? "bg-[#C9A84C]/10 text-[#C9A84C]"
                : "bg-white/5 text-muted-foreground"
            )}
          >
            {icon}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-8 rounded bg-white/5 animate-pulse w-2/3" />
            <div className="h-3 rounded bg-white/5 animate-pulse w-full" />
          </div>
        ) : (
          <>
            <p
              className={cn(
                "text-2xl font-bold",
                highlight ? "text-[#C9A84C]" : "text-foreground"
              )}
            >
              {value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
