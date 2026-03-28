import { Link } from "wouter";
import { Shield, KeyRound, Clock, Zap, ArrowRight, Activity, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useListAccounts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data, isLoading, error } = useListAccounts();

  const totalAccounts = data?.total || 0;
  const validAccounts = data?.accounts.filter(a => !a.is_expired).length || 0;
  const expiredAccounts = totalAccounts - validAccounts;

  const recentAccounts = data?.accounts.slice(0, 5) || [];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Hero Section */}
      <section className="relative glass-panel rounded-3xl p-8 sm:p-12 overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />
        
        <div className="relative z-10 max-w-2xl">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 mb-6 py-1.5 px-4 font-display font-semibold tracking-wide">
            SYSTEM STATUS: ONLINE
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold leading-tight mb-6">
            Authenticate & Manage <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
              Qwen Intelligence
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            Seamlessly authorize your devices using RFC 8628 Device Flow. Monitor tokens, manage CPAMC configurations, and automate batch registrations from a single nexus.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/auth">
              <Button size="lg" className="h-14 px-8 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all bg-gradient-to-r from-primary to-accent border-0">
                <Zap className="w-5 h-5 mr-2" />
                Start Registration Flow
              </Button>
            </Link>
            <Link href="/accounts">
              <Button size="lg" variant="outline" className="h-14 px-8 text-base font-semibold bg-secondary/50 backdrop-blur-sm border-border hover:bg-secondary">
                View All Accounts
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard 
          title="Total Identities" 
          value={isLoading ? null : totalAccounts.toString()} 
          icon={Shield} 
          description="Registered across all methods"
          trend="+12% from last week"
        />
        <MetricCard 
          title="Active Tokens" 
          value={isLoading ? null : validAccounts.toString()} 
          icon={Activity} 
          description="Currently valid & ready"
          trend="Operational"
          trendColor="text-green-400"
        />
        <MetricCard 
          title="Expired Tokens" 
          value={isLoading ? null : expiredAccounts.toString()} 
          icon={AlertCircle} 
          description="Require refreshment"
          trend="Needs Attention"
          trendColor="text-yellow-400"
        />
      </section>

      {/* Recent Activity */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight">Recent Authorizations</h2>
            <p className="text-sm text-muted-foreground mt-1">Your latest registered API and OAuth tokens.</p>
          </div>
          <Link href="/accounts" className="text-primary hover:text-accent font-medium text-sm flex items-center transition-colors">
            View Archive <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        <Card className="glass-panel border-0 bg-card/40">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-4 p-6">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl bg-secondary/50" />
                ))}
              </div>
            ) : error ? (
              <div className="p-12 text-center text-muted-foreground">
                <AlertCircle className="w-10 h-10 mx-auto mb-4 text-destructive/50" />
                Failed to load accounts. Is the API server running?
              </div>
            ) : recentAccounts.length === 0 ? (
              <div className="p-16 text-center">
                <KeyRound className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                <h3 className="text-xl font-display font-semibold mb-2">No accounts found</h3>
                <p className="text-muted-foreground mb-6">Initiate the device flow to get started.</p>
                <Link href="/auth">
                  <Button variant="outline">Authorize Device</Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentAccounts.map((account) => (
                  <div key={account.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-secondary/20 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
                        <KeyRound className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground tracking-wide">{account.label || "Qwen OAuth Token"}</h4>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center font-mono bg-secondary/50 px-2 py-0.5 rounded text-foreground/70">
                            {account.access_token_preview || account.id.substring(0,8)}...
                          </span>
                          <span className="flex items-center">
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            {format(new Date(account.created_at), "MMM dd, HH:mm")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Badge variant={account.is_expired ? "destructive" : "default"} className={!account.is_expired ? "bg-primary/20 text-primary border-primary/30 hover:bg-primary/30" : ""}>
                        {account.is_expired ? "EXPIRED" : "ACTIVE"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

    </div>
  );
}

function MetricCard({ title, value, icon: Icon, description, trend, trendColor = "text-primary" }: any) {
  return (
    <Card className="glass-panel border-0 bg-card/40 hover:bg-card/60 transition-all duration-300 hover:-translate-y-1">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground">{title}</CardTitle>
        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border">
          <Icon className="w-5 h-5 text-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-display font-bold">
          {value !== null ? value : <Skeleton className="h-9 w-16 bg-secondary" />}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className={`font-semibold ${trendColor}`}>{trend}</span>
          <span className="text-muted-foreground">{description}</span>
        </div>
      </CardContent>
    </Card>
  );
}
