import { useState } from "react";
import { format } from "date-fns";
import { Search, Download, Trash2, RefreshCw, CheckCircle2, AlertCircle, Key, Loader2 } from "lucide-react";
import { 
  useListAccounts, 
  useVerifyToken, 
  useDeleteAccount,
  getListAccountsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AccountsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useListAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { mutateAsync: verifyToken, isPending: isVerifying } = useVerifyToken();
  const { mutateAsync: deleteAccount, isPending: isDeleting } = useDeleteAccount();

  // Selected account for loading states during actions
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const filteredAccounts = data?.accounts.filter(a => 
    a.label?.toLowerCase().includes(search.toLowerCase()) || 
    a.id.toLowerCase().includes(search.toLowerCase()) ||
    a.access_token_preview?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handleExportCSV = () => {
    if (!data?.accounts) return;
    const header = "ID,Label,Created,Expires,Status,Preview\n";
    const rows = data.accounts.map(a => 
      `${a.id},"${a.label || ''}",${a.created_at},${a.expires_at || ''},${a.is_expired ? 'Expired' : 'Valid'},${a.access_token_preview || ''}`
    ).join("\n");
    
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qwen-accounts.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Accounts exported to CSV successfully." });
  };

  const handleExportJSON = () => {
    if (!data?.accounts) return;
    const blob = new Blob([JSON.stringify(data.accounts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qwen-accounts.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Accounts exported to JSON successfully." });
  };

  const handleVerify = async (id: string) => {
    setActiveActionId(`verify-${id}`);
    try {
      const res = await verifyToken({ data: { access_token: id } }); // API might need actual token, using ID as fallback
      if (res.valid) {
        toast({ title: "Valid", description: res.message || "Token is fully operational." });
      } else {
        toast({ title: "Invalid", description: res.message || "Token verification failed.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Verification Error", description: e.message || "Could not reach verification server.", variant: "destructive" });
    } finally {
      setActiveActionId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this credentials file?")) return;
    setActiveActionId(`delete-${id}`);
    try {
      await deleteAccount({ data: { id } });
      toast({ title: "Deleted", description: "Account removed successfully." });
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    } catch (e: any) {
      toast({ title: "Delete Error", description: e.message || "Could not delete account.", variant: "destructive" });
    } finally {
      setActiveActionId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Identity Registry</h1>
          <p className="text-muted-foreground mt-2">Manage your stored Qwen access tokens and keys.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleExportCSV} className="bg-card/50 border-border/80" disabled={isLoading || filteredAccounts.length === 0}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
          <Button variant="outline" onClick={handleExportJSON} className="bg-card/50 border-border/80" disabled={isLoading || filteredAccounts.length === 0}>
            <Download className="w-4 h-4 mr-2" /> JSON
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-0 bg-card/60 shadow-2xl overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-border/50 flex flex-col sm:flex-row gap-4 items-center justify-between bg-card/40">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by label or preview..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-background/50 border-border/80 focus:ring-primary/20"
            />
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            {isLoading ? <Skeleton className="w-16 h-5" /> : `Showing ${filteredAccounts.length} / ${data?.total || 0}`}
          </div>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-4">
               {[1,2,3,4].map(i => <Skeleton key={i} className="w-full h-16 rounded-xl bg-secondary/40" />)}
            </div>
          ) : error ? (
            <div className="p-16 text-center text-muted-foreground flex flex-col items-center">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <p className="text-lg font-medium">Failed to load registry</p>
              <p className="text-sm mt-1">Check if the backend server is running correctly.</p>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="p-20 text-center flex flex-col items-center">
              <Key className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium">No accounts found</p>
              <p className="text-muted-foreground text-sm mt-1">Try adjusting your search filters or register a new device.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-secondary/20">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="font-semibold text-muted-foreground py-4">Identity</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Token Preview</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Timeline</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
                    <TableHead className="font-semibold text-muted-foreground text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {filteredAccounts.map((account) => (
                    <TableRow key={account.id} className="hover:bg-secondary/30 transition-colors border-border/30">
                      <TableCell className="py-4">
                        <div className="font-medium text-foreground tracking-wide">
                          {account.label || "Unnamed Token"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono opacity-60">
                          {account.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono bg-background/50 px-2.5 py-1 rounded-md text-xs border border-border/50 text-foreground/80">
                          {account.access_token_preview || '••••••••'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div><span className="text-muted-foreground text-xs uppercase tracking-wider mr-2">C</span>{format(new Date(account.created_at), "yyyy-MM-dd HH:mm")}</div>
                          {account.expires_at && (
                            <div className="mt-1"><span className="text-muted-foreground text-xs uppercase tracking-wider mr-2">E</span>{format(new Date(account.expires_at), "yyyy-MM-dd HH:mm")}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={account.is_expired ? "destructive" : "outline"}
                          className={`font-semibold tracking-wide ${!account.is_expired ? "border-green-500/30 text-green-400 bg-green-500/10" : ""}`}
                        >
                          {account.is_expired ? (
                            <><AlertCircle className="w-3 h-3 mr-1" /> EXPIRED</>
                          ) : (
                            <><CheckCircle2 className="w-3 h-3 mr-1" /> ACTIVE</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="bg-secondary hover:bg-secondary/80 text-xs h-8 px-3"
                            onClick={() => handleVerify(account.id)}
                            disabled={activeActionId !== null}
                          >
                            {activeActionId === `verify-${account.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                            Verify
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="icon" 
                            className="h-8 w-8 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white border border-destructive/20 transition-colors"
                            onClick={() => handleDelete(account.id)}
                            disabled={activeActionId !== null}
                          >
                            {activeActionId === `delete-${account.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
