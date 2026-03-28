import { useState, useEffect } from "react";
import { Save, Loader2, Network, Cpu, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  
  // Local Settings State
  const [proxy, setProxy] = useState("");
  const [concurrent, setConcurrent] = useState("1");
  const [rounds, setRounds] = useState("1");
  const [minDelay, setMinDelay] = useState("5");
  const [maxDelay, setMaxDelay] = useState("15");
  const [singleMode, setSingleMode] = useState(false);
  const [disableSub2Api, setDisableSub2Api] = useState(false);

  useEffect(() => {
    // Load from local storage
    try {
      const saved = localStorage.getItem("qwen-auth-settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        setProxy(parsed.proxy || "");
        setConcurrent(parsed.concurrent || "1");
        setRounds(parsed.rounds || "1");
        setMinDelay(parsed.minDelay || "5");
        setMaxDelay(parsed.maxDelay || "15");
        setSingleMode(parsed.singleMode || false);
        setDisableSub2Api(parsed.disableSub2Api || false);
      }
    } catch (e) {}
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      localStorage.setItem("qwen-auth-settings", JSON.stringify({
        proxy, concurrent, rounds, minDelay, maxDelay, singleMode, disableSub2Api
      }));
      setIsSaving(false);
      toast({ title: "Settings Saved", description: "Your batch processing configuration has been updated." });
    }, 600); // simulated fake delay for premium feel
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Configuration</h1>
        <p className="text-muted-foreground mt-2">Tune batch limits, proxies, and automation delays.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Network Config */}
        <Card className="glass-panel border-0 bg-card/60">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Network className="w-5 h-5 text-primary" /> Network
            </CardTitle>
            <CardDescription>Proxy and tunneling settings</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-3">
              <Label>Proxy Address</Label>
              <Input 
                placeholder="http://127.0.0.1:7890" 
                value={proxy}
                onChange={(e) => setProxy(e.target.value)}
                className="bg-background/50 focus:ring-primary/20"
              />
              <p className="text-xs text-muted-foreground">Used for all outbound auth requests if populated.</p>
            </div>

            <div className="flex items-center justify-between border-t border-border/50 pt-6">
              <div className="space-y-0.5">
                <Label>Disable Sub2Api Push</Label>
                <p className="text-xs text-muted-foreground">Prevent automatically pushing to Sub2Api</p>
              </div>
              <Switch checked={disableSub2Api} onCheckedChange={setDisableSub2Api} />
            </div>
          </CardContent>
        </Card>

        {/* Batch Automation */}
        <Card className="glass-panel border-0 bg-card/60">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Cpu className="w-5 h-5 text-primary" /> Batch Automation
            </CardTitle>
            <CardDescription>Control mass-registration parameters</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Concurrent Threads</Label>
                <Input 
                  type="number" 
                  min="1" 
                  value={concurrent}
                  onChange={(e) => setConcurrent(e.target.value)}
                  className="bg-background/50 focus:ring-primary/20 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Batch Rounds</Label>
                <Input 
                  type="number" 
                  min="0" 
                  value={rounds}
                  onChange={(e) => setRounds(e.target.value)}
                  className="bg-background/50 focus:ring-primary/20 font-mono"
                />
                <p className="text-[10px] text-muted-foreground absolute">0 = infinite</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-6">
              <div className="space-y-2">
                <Label>Min Delay (s)</Label>
                <Input 
                  type="number" 
                  min="1" 
                  value={minDelay}
                  onChange={(e) => setMinDelay(e.target.value)}
                  className="bg-background/50 focus:ring-primary/20 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Delay (s)</Label>
                <Input 
                  type="number" 
                  min="1" 
                  value={maxDelay}
                  onChange={(e) => setMaxDelay(e.target.value)}
                  className="bg-background/50 focus:ring-primary/20 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border/50 pt-6">
              <div className="space-y-0.5">
                <Label className="text-accent">Single Account Mode</Label>
                <p className="text-xs text-muted-foreground">Stop after registering 1 account</p>
              </div>
              <Switch checked={singleMode} onCheckedChange={setSingleMode} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        <Button 
          size="lg" 
          onClick={handleSave} 
          disabled={isSaving}
          className="w-full sm:w-auto h-14 px-10 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
        >
          {isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
          Save Configurations
        </Button>
      </div>
    </div>
  );
}
