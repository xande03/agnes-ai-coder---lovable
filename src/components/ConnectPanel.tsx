import { AlertCircle, Github, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RepoInfo, Session } from "@/lib/session";

export function ConnectPanel({ onConnect }: { onConnect: (s: Session) => void }) {
  const [token, setToken] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseRepo(value: string) {
    const cleaned = value
      .trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/$/, "");
    const [owner, repo] = cleaned.split("/");
    return { owner: owner ?? "", repo: repo ?? "" };
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { owner, repo } = parseRepo(repoUrl);
    if (!token.trim() || !owner || !repo) {
      setError("Informe o token e o repositório no formato owner/repo.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/repo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          token: token.trim(),
          owner,
          repo,
          branch: branch.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        info?: RepoInfo;
        branch?: string;
        error?: string;
      };
      if (!res.ok || !data.info) throw new Error(data.error ?? "Falha ao conectar");
      onConnect({
        token: token.trim(),
        owner,
        repo,
        branch: data.branch ?? data.info.defaultBranch,
        info: data.info,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25">
            <Github className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Agnes Repo Agent</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Conecte seu repositório e deixe o agente{" "}
            <span className="font-mono text-primary">agnes-2.5-flash</span> editar, commitar e
            enviar as mudanças automaticamente.
          </p>
        </div>

        <form onSubmit={connect} className="surface-panel space-y-5 p-6 sm:p-7">
          <div className="space-y-2">
            <Label htmlFor="token" className="flex items-center gap-2 text-xs tracking-wide uppercase">
              <KeyRound className="h-3.5 w-3.5" /> GitHub Access Token
            </Label>
            <Input
              id="token"
              type="password"
              autoComplete="off"
              placeholder="ghp_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Token clássico ou fine-grained com permissão de leitura e escrita em Contents.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="repo" className="text-xs tracking-wide uppercase">
              Repositório
            </Label>
            <Input
              id="repo"
              placeholder="owner/repositorio"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch" className="text-xs tracking-wide uppercase">
              Branch <span className="normal-case opacity-60">(opcional)</span>
            </Label>
            <Input
              id="branch"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/35 bg-destructive/8 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
            {loading ? "Conectando..." : "Conectar projeto"}
          </Button>

          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Suas credenciais ficam apenas neste navegador.
          </p>
        </form>
      </div>
    </main>
  );
}
