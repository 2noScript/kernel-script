import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type StatVariant = "default" | "amber" | "sky" | "emerald" | "destructive" | "muted";

export default function StatStatus({
  icon,
  value,
  label,
  onClick,
  isActive,
  variant = "default",
}: {
  icon: ReactNode;
  value: number | string;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
  variant?: StatVariant;
}) {
  const variantStyles = {
    default: {
      active: "bg-primary/10 border-primary/30",
      activeText: "text-primary",
      iconBg: "group-hover:bg-primary/10",
      iconActiveBg: "bg-primary/20",
    },
    amber: {
      active: "bg-amber-500/10 border-amber-500/30",
      activeText: "text-amber-500",
      iconBg: "group-hover:bg-amber-500/10",
      iconActiveBg: "bg-amber-500/20",
    },
    sky: {
      active: "bg-sky-500/10 border-sky-500/30",
      activeText: "text-sky-500",
      iconBg: "group-hover:bg-sky-500/10",
      iconActiveBg: "bg-sky-500/20",
    },
    emerald: {
      active: "bg-emerald-500/10 border-emerald-500/30",
      activeText: "text-emerald-500",
      iconBg: "group-hover:bg-emerald-500/10",
      iconActiveBg: "bg-emerald-500/20",
    },
    destructive: {
      active: "bg-destructive/10 border-destructive/30",
      activeText: "text-destructive",
      iconBg: "group-hover:bg-destructive/10",
      iconActiveBg: "bg-destructive/20",
    },
    muted: {
      active: "bg-muted border-border/50",
      activeText: "text-muted-foreground",
      iconBg: "group-hover:bg-muted",
      iconActiveBg: "bg-muted",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg bg-background/50 border border-border/50 shadow-sm transition-all hover:border-primary/30 group",
        onClick && "cursor-pointer hover:bg-muted/50",
        isActive && styles.active,
      )}
    >
      <div
        className={cn(
          "p-1.5 rounded-lg bg-muted/50 transition-colors",
          styles.iconBg,
          isActive && styles.iconActiveBg,
        )}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-black tabular-nums leading-none">
          {value}
        </span>
        <span
          className={cn(
            "text-[8px] font-bold text-muted-foreground uppercase tracking-widest leading-none mt-0.5 transition-colors",
            isActive && styles.activeText,
          )}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

