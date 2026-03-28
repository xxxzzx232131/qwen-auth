import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import { format } from "date-fns";

interface TerminalLogProps {
  logs: string[];
}

export function TerminalLog({ logs }: TerminalLogProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="rounded-2xl bg-[#0c0c0e] border border-border/50 shadow-2xl overflow-hidden flex flex-col h-full font-mono text-xs sm:text-sm">
      <div className="h-10 bg-[#151518] border-b border-border/50 flex items-center px-4 justify-between select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground font-semibold tracking-wider text-[11px]">PROCESS.LOG</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
        {logs.length === 0 ? (
          <div className="text-muted-foreground/40 italic">Waiting for processes to start...</div>
        ) : (
          logs.map((log, i) => {
            const isError = log.toLowerCase().includes("error") || log.toLowerCase().includes("fail");
            const isSuccess = log.toLowerCase().includes("success") || log.toLowerCase().includes("authorized");
            const isWarning = log.toLowerCase().includes("expired") || log.toLowerCase().includes("pending");
            
            return (
              <div key={i} className="flex gap-3 font-mono opacity-90 hover:opacity-100 transition-opacity">
                <span className="text-muted-foreground/50 shrink-0">
                  [{format(new Date(), "HH:mm:ss")}]
                </span>
                <span className={`
                  ${isError ? "text-destructive" : ""}
                  ${isSuccess ? "text-primary" : ""}
                  ${isWarning ? "text-yellow-400" : ""}
                  ${!isError && !isSuccess && !isWarning ? "text-foreground/80" : ""}
                `}>
                  {log}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
