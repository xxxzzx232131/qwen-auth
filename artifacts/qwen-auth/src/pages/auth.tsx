/**
 * Qwen Authentication Page
 * Three modes:
 *  1. OAuth Device Flow — manual browser login per account
 *  2. Auto Register    — fully automated via temp email (Mail.tm) + Qwen registration API
 *  3. CPAMC            — direct API key save
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Smartphone, Key, QrCode, ExternalLink, ShieldAlert, Loader2,
  CheckCircle2, XCircle, RefreshCw, Copy, Check, Bot, Play, Square,
  Settings2
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useRequestDeviceCode,
  usePollToken,
  useSaveCredentials,
} from "@workspace/api-client-react";
import type { DeviceCodeResponse } from "@workspace/api-client-react/src/generated/api.schemas";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { TerminalLog } from "@/components/terminal-log";

export default function AuthPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [completedCount, setCompletedCount] = useState(0);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLogs(prev => [...prev.slice(-199), `[${ts}] ${msg}`]);
  }, []);

  const handleSuccess = useCallback(() => setCompletedCount(c => c + 1), []);

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">OAuth 授权登录</h1>
          <p className="text-muted-foreground mt-2">
            自动批量注册 Qwen 账号，或通过设备码 / API Key 手动绑定。
          </p>
        </div>
        {completedCount > 0 && (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 px-4 py-2 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            已完成 {completedCount} 个
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-[580px]">
        <div className="flex flex-col h-full">
          <Tabs defaultValue="auto" className="flex-1 flex flex-col h-full">
            <TabsList className="grid w-full grid-cols-3 h-12 bg-card/40 border border-border/50 rounded-xl p-1 mb-5">
              <TabsTrigger value="auto" className="rounded-lg font-medium text-xs">
                <Bot className="w-3.5 h-3.5 mr-1.5" />
                自动注册
              </TabsTrigger>
              <TabsTrigger value="oauth" className="rounded-lg font-medium text-xs">
                <Smartphone className="w-3.5 h-3.5 mr-1.5" />
                设备授权
              </TabsTrigger>
              <TabsTrigger value="cpamc" className="rounded-lg font-medium text-xs">
                <Key className="w-3.5 h-3.5 mr-1.5" />
                API Key
              </TabsTrigger>
            </TabsList>

            <TabsContent value="auto" className="flex-1 mt-0 h-full">
              <AutoRegisterFlow addLog={addLog} onSuccess={handleSuccess} />
            </TabsContent>

            <TabsContent value="oauth" className="flex-1 mt-0 h-full">
              <OAuthFlow addLog={addLog} onSuccess={handleSuccess} />
            </TabsContent>

            <TabsContent value="cpamc" className="flex-1 mt-0 h-full">
              <CPAMCFlow addLog={addLog} onSuccess={handleSuccess} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="h-full min-h-[400px]">
          <TerminalLog logs={logs} />
        </div>
      </div>
    </div>
  );
}

// ─── AUTO REGISTER FLOW ───────────────────────────────────────────────────────

type AutoStatus = "idle" | "running" | "done" | "error";

function AutoRegisterFlow({ addLog, onSuccess }: { addLog: (m: string) => void; onSuccess: () => void }) {
  const [status, setStatus] = useState<AutoStatus>("idle");
  const [count, setCount] = useState(5);
  const [concurrent, setConcurrent] = useState(1);
  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(8);
  const [proxy, setProxy] = useState("");
  const [stats, setStats] = useState({ completed: 0, failed: 0, total: 0 });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  const stop = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  const handleStart = () => {
    stop();
    setStatus("running");
    setStats({ completed: 0, failed: 0, total: count });

    const params = new URLSearchParams({
      count: String(count),
      concurrent: String(concurrent),
      minDelay: String(minDelay * 1000),
      maxDelay: String(maxDelay * 1000),
      ...(proxy ? { proxy } : {}),
    });

    const es = new EventSource(`/api/qwen/register/stream?${params.toString()}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as {
          type: string;
          msg?: string;
          idx?: number;
          email?: string;
          tokenPreview?: string;
          completed?: number;
          failed?: number;
          total?: number;
        };

        if (data.type === "log" && data.msg) {
          addLog(data.msg);
        } else if (data.type === "success") {
          onSuccess();
          setStats(s => ({ ...s, completed: s.completed + 1 }));
          addLog(`✓ 注册成功: ${data.email ?? ""}`);
        } else if (data.type === "fail") {
          setStats(s => ({ ...s, failed: s.failed + 1 }));
        } else if (data.type === "done") {
          const c = data.completed ?? 0;
          const f = data.failed ?? 0;
          setStats({ completed: c, failed: f, total: data.total ?? count });
          setStatus("done");
          es.close();
          esRef.current = null;
          toast({
            title: "批量注册完成",
            description: `${c} 个成功，${f} 个失败`,
            variant: c > 0 ? "default" : "destructive",
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      addLog("[ERROR] 连接中断");
      setStatus("error");
      es.close();
      esRef.current = null;
    };
  };

  const handleStop = () => {
    stop();
    setStatus("idle");
    addLog("用户手动停止注册");
  };

  const progress = stats.total > 0
    ? Math.round(((stats.completed + stats.failed) / stats.total) * 100)
    : 0;

  return (
    <Card className="h-full border-0 bg-card/60 backdrop-blur flex flex-col">
      <CardHeader className="border-b border-border/50 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          全自动批量注册
        </CardTitle>
        <CardDescription>
          使用临时邮箱自动注册 Qwen 账号，无需手动干预
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">

        {/* Stats bar when running or done */}
        {(status === "running" || status === "done") && (
          <div className="bg-background/60 border border-border rounded-xl p-4">
            <div className="flex items-center justify-between text-sm mb-3">
              <span className="text-muted-foreground">进度</span>
              <span className="font-mono font-bold">{stats.completed + stats.failed} / {stats.total}</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-green-400 rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <div className="flex gap-4 mt-3 text-xs">
              <span className="text-green-400 font-semibold">✓ {stats.completed} 成功</span>
              {stats.failed > 0 && <span className="text-red-400 font-semibold">✗ {stats.failed} 失败</span>}
              {status === "running" && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 注册中...
                </span>
              )}
            </div>
          </div>
        )}

        {/* Config form */}
        {status !== "running" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                  注册数量
                </Label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={1} max={50} step={1}
                    value={[count]}
                    onValueChange={([v]) => setCount(v)}
                    className="flex-1"
                  />
                  <span className="text-primary font-bold font-mono w-8 text-right">{count}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                  并发数
                </Label>
                <div className="flex items-center gap-3">
                  <Slider
                    min={1} max={5} step={1}
                    value={[concurrent]}
                    onValueChange={([v]) => setConcurrent(v)}
                    className="flex-1"
                  />
                  <span className="text-primary font-bold font-mono w-8 text-right">{concurrent}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                账号间延时: {minDelay}s – {maxDelay}s
              </Label>
              <div className="flex items-center gap-3">
                <Slider
                  min={1} max={30} step={1}
                  value={[minDelay, maxDelay]}
                  onValueChange={([a, b]) => { setMinDelay(a); setMaxDelay(b); }}
                  className="flex-1"
                />
              </div>
            </div>

            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              onClick={() => setShowAdvanced(v => !v)}
            >
              <Settings2 className="w-3.5 h-3.5" />
              {showAdvanced ? "隐藏高级设置" : "高级设置（代理等）"}
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">代理地址（可选）</Label>
                    <Input
                      placeholder="http://user:pass@host:port"
                      value={proxy}
                      onChange={e => setProxy(e.target.value)}
                      className="h-10 font-mono text-sm"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="pt-2 mt-auto">
          {status === "running" ? (
            <Button
              size="lg"
              variant="destructive"
              className="w-full h-12 font-semibold"
              onClick={handleStop}
            >
              <Square className="w-4 h-4 mr-2 fill-current" /> 停止注册
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full h-12 font-semibold bg-gradient-to-r from-primary to-accent"
              onClick={handleStart}
            >
              <Play className="w-4 h-4 mr-2 fill-current" />
              {status === "done" ? `再注册 ${count} 个` : `开始注册 ${count} 个账号`}
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground/60 text-center leading-relaxed">
          使用 Mail.tm 免费临时邮箱 · 自动获取验证码 · 保存 JWT Token 到数据库
        </div>
      </CardContent>
    </Card>
  );
}

// ─── OAUTH DEVICE FLOW ────────────────────────────────────────────────────────

type FlowStep = "idle" | "waiting" | "authorized" | "failed";

function OAuthFlow({ addLog, onSuccess }: { addLog: (m: string) => void; onSuccess: () => void }) {
  const [step, setStep] = useState<FlowStep>("idle");
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiresAtRef = useRef<number>(0);

  const { mutateAsync: requestDeviceCode, isPending: isRequesting } = useRequestDeviceCode();
  const { mutateAsync: pollToken } = usePollToken();
  const { mutateAsync: saveCredentials } = useSaveCredentials();
  const { toast } = useToast();

  const stopAll = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const handleStart = async () => {
    stopAll();
    setStep("idle");
    setDeviceCode(null);
    addLog("─".repeat(40));
    addLog("开始设备授权流程 (RFC 8628 + PKCE)...");

    try {
      const res = await requestDeviceCode();
      setDeviceCode(res);
      setTimeLeft(res.expires_in);
      expiresAtRef.current = Date.now() + res.expires_in * 1000;
      setStep("waiting");

      addLog(`✓ 获取设备码成功`);
      addLog(`  User Code: ${res.user_code ?? "(内嵌于链接)"}`);
      addLog(`  过期时间: ${res.expires_in}s`);
      addLog("⚠ 请立即打开以下链接并用 Qwen 账号登录：");
      addLog(`  ${res.verification_uri_complete ?? res.verification_uri}`);
      addLog("等待用户完成授权...");

      countdownRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          stopAll();
          setStep("failed");
          setDeviceCode(null);
          addLog("[ERROR] 设备码已过期，请重新开始");
        }
      }, 1000);

      const interval = (res.interval ?? 5) * 1000;
      let isInFlight = false;
      pollingRef.current = setInterval(async () => {
        if (isInFlight || expiresAtRef.current <= Date.now()) return;
        isInFlight = true;
        try {
          const poll = await pollToken({ data: { device_code: res.device_code } });
          if (poll.status === "authorized" && poll.access_token) {
            stopAll();
            addLog("✓ 授权成功！正在保存凭证...");
            await saveCredentials({
              data: {
                access_token: poll.access_token,
                refresh_token: poll.refresh_token,
                expires_in: poll.expires_in,
                token_type: poll.token_type,
                label: `Qwen OAuth ${new Date().toLocaleString("zh-CN")}`,
              },
            });
            addLog("✓ 凭证已保存到数据库");
            setStep("authorized");
            onSuccess();
            toast({ title: "授权完成", description: "Qwen 账号已成功绑定" });
          } else if (poll.status === "expired" || poll.status === "error") {
            stopAll();
            setStep("failed");
            setDeviceCode(null);
            addLog(`[ERROR] ${poll.message ?? "授权失败"}`);
          } else {
            addLog(`· 等待用户授权... (剩余 ${Math.max(0, Math.round((expiresAtRef.current - Date.now()) / 1000))}s)`);
          }
        } catch (err: unknown) {
          addLog(`[WARN] 轮询异常: ${(err as Error).message}`);
        } finally {
          isInFlight = false;
        }
      }, interval);
    } catch (err: unknown) {
      addLog(`[ERROR] 获取设备码失败: ${(err as Error).message}`);
      setStep("failed");
      toast({ title: "请求失败", description: "无法获取设备码", variant: "destructive" });
    }
  };

  const verifyUrl = deviceCode?.verification_uri_complete ?? deviceCode?.verification_uri ?? "";

  return (
    <Card className="h-full border-0 bg-card/60 backdrop-blur flex flex-col">
      <CardHeader className="border-b border-border/50 pb-5">
        <CardTitle className="text-lg">设备授权流程</CardTitle>
        <CardDescription>获取验证链接 → 用浏览器打开并登录 → 自动完成授权保存</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-6 gap-5">
        <AnimatePresence mode="wait">
          {step === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center text-center gap-6">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
                <QrCode className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">手动设备授权</h3>
                <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                  需要已有 Qwen 账号。点击按钮获取链接，在浏览器登录后自动保存 Token。
                </p>
              </div>
              <Button size="lg" className="w-full max-w-xs h-12 font-semibold" onClick={handleStart} disabled={isRequesting}>
                {isRequesting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 获取中...</> : <><QrCode className="w-4 h-4 mr-2" /> 获取验证链接</>}
              </Button>
            </motion.div>
          )}

          {step === "waiting" && deviceCode && (
            <motion.div key="waiting" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col gap-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                <ExternalLink className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-300 text-sm">请用浏览器打开以下链接并登录</p>
                  <p className="text-amber-400/70 text-xs mt-1">登录后系统自动检测并保存，无需其他操作</p>
                </div>
              </div>
              <div className="bg-background/60 border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-2 font-semibold tracking-wider uppercase">验证链接</p>
                <a href={verifyUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-blue-300 text-sm break-all font-mono">
                  {verifyUrl}
                </a>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="flex-1 h-9" asChild>
                    <a href={verifyUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> 打开链接
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 px-3" onClick={async () => {
                    await navigator.clipboard.writeText(verifyUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}>
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                {deviceCode.user_code && (
                  <div className="flex-1 bg-background/60 border border-border rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">验证码</p>
                    <div className="text-2xl font-mono font-bold tracking-[0.15em] text-primary">{deviceCode.user_code}</div>
                  </div>
                )}
                <div className="bg-white p-2.5 rounded-xl shrink-0">
                  <QRCodeSVG value={verifyUrl} size={80} level="M" bgColor="#ffffff" fgColor="#000000" />
                </div>
              </div>
              <div className="flex items-center justify-between bg-background/40 border border-border/50 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  <span className="text-muted-foreground">等待授权...</span>
                </div>
                <span className={`font-mono font-bold text-sm ${timeLeft < 60 ? "text-red-400" : "text-muted-foreground"}`}>
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
                </span>
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => { stopAll(); setStep("idle"); setDeviceCode(null); }}>
                取消
              </Button>
            </motion.div>
          )}

          {step === "authorized" && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center text-center gap-5">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/30">
                <CheckCircle2 className="w-10 h-10 text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-green-400 mb-2">授权成功！</h3>
                <p className="text-muted-foreground text-sm">Token 已自动保存到数据库</p>
              </div>
              <Button className="w-full max-w-xs h-11 font-semibold" onClick={handleStart}>
                <RefreshCw className="w-4 h-4 mr-2" /> 继续注册下一个
              </Button>
            </motion.div>
          )}

          {step === "failed" && (
            <motion.div key="failed" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center text-center gap-5">
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/30">
                <XCircle className="w-10 h-10 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-red-400 mb-2">授权超时或失败</h3>
                <p className="text-muted-foreground text-sm">设备码已过期，请重新获取</p>
              </div>
              <Button className="w-full max-w-xs h-11 font-semibold" onClick={handleStart} disabled={isRequesting}>
                <RefreshCw className="w-4 h-4 mr-2" /> 重新开始
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ─── CPAMC FLOW ───────────────────────────────────────────────────────────────

function CPAMCFlow({ addLog, onSuccess }: { addLog: (m: string) => void; onSuccess: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [saved, setSaved] = useState(false);
  const { mutateAsync: saveCredentials, isPending } = useSaveCredentials();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    addLog("─".repeat(40));
    addLog("CPAMC 模式：直接保存 API Key...");
    try {
      await saveCredentials({ data: { access_token: apiKey.trim(), token_type: "cpamc", label: label || "CPAMC API Key" } });
      addLog("✓ API Key 已安全保存");
      toast({ title: "保存成功", description: "API Key 已存储" });
      setSaved(true);
      onSuccess();
      setApiKey("");
      setLabel("");
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      addLog(`[ERROR] ${(err as Error).message}`);
      toast({ title: "错误", description: "保存失败", variant: "destructive" });
    }
  };

  return (
    <Card className="h-full border-0 bg-card/60 backdrop-blur flex flex-col">
      <CardHeader className="border-b border-border/50 pb-5">
        <CardTitle className="text-lg flex items-center gap-2">
          Coding Plan API Key
          <Badge variant="secondary" className="font-mono text-xs">sk-sp-*</Badge>
        </CardTitle>
        <CardDescription>适用于阿里云付费 Coding Plan，无需浏览器授权</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-6">
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive-foreground/80 flex items-start gap-3 mb-6">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-destructive" />
          <p>API Key 为付费功能，无付费订阅请使用"自动注册"标签页。</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Access Token / API Key</Label>
            <Input id="apiKey" type="password" placeholder="sk-xxxxxxxxxxxxxxxx..." value={apiKey} onChange={e => setApiKey(e.target.value)} className="h-12 font-mono" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">备注标签（可选）</Label>
            <Input id="label" placeholder="例：生产环境密钥" value={label} onChange={e => setLabel(e.target.value)} className="h-12" />
          </div>
          <Button type="submit" size="lg" className="w-full h-12 font-semibold mt-2" disabled={isPending || !apiKey.trim()}>
            {saved ? <><Check className="w-4 h-4 mr-2 text-green-400" /> 保存成功</> :
              isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "保存 API Key"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
