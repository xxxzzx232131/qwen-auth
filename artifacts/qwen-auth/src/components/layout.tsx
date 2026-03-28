import { Link, useRoute } from "wouter";
import { LayoutDashboard, KeyRound, List, Settings, ShieldCheck, Activity } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ReactNode } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/auth", label: "Authorization", icon: KeyRound },
  { href: "/accounts", label: "Accounts", icon: List },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ children }: { children: ReactNode }) {
  const [isActive] = useRoute("/:path*");

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground overflow-hidden relative">
      {/* Background ambient glow */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/hero-glow.png`}
          alt="Ambient Glow"
          className="absolute -top-[30%] -left-[10%] w-[70%] opacity-20 blur-[120px] mix-blend-screen"
        />
        <div className="absolute bottom-[10%] right-[5%] w-[40%] h-[40%] bg-accent/10 rounded-full blur-[150px] mix-blend-screen" />
      </div>

      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 border-r border-border/50 bg-card/40 backdrop-blur-xl z-10 flex flex-col">
        <div className="h-20 flex items-center px-8 border-b border-border/50">
          <ShieldCheck className="w-8 h-8 text-primary mr-3" />
          <div>
            <h1 className="font-display font-bold text-xl tracking-wide bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
              QwenAuth
            </h1>
            <p className="text-[10px] text-primary tracking-widest uppercase font-semibold">Nexus Manager</p>
          </div>
        </div>

        <nav className="flex-1 py-8 px-4 space-y-2">
          {navItems.map((item) => {
            const active = isActive ? window.location.pathname === item.href : item.href === "/";
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300 group relative overflow-hidden",
                  active 
                    ? "text-primary-foreground bg-primary/10 border border-primary/20 shadow-[0_0_20px_rgba(0,240,255,0.1)]" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
                )}
                <item.icon className={cn("w-5 h-5 transition-transform duration-300", active ? "scale-110 text-primary" : "group-hover:scale-110")} />
                <span className="font-display tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-border/50">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/30 border border-border/50">
            <Activity className="w-4 h-4 text-green-400 animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground">System Online</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden z-10">
        <div className="flex-1 overflow-y-auto p-8 lg:p-12 scroll-smooth">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
