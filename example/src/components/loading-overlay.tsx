import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  message?: string;
  className?: string;
}

export function LoadingOverlay({ 
  message = "Loading...", 
  className 
}: LoadingOverlayProps) {
  return (
    <div 
      className={`absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50 ${className}`}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <span className="text-sm font-medium text-muted-foreground">{message}</span>
      </div>
    </div>
  );
}