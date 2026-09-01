import { createFileRoute } from "@tanstack/react-router";
import {
  Code2,
  Download,
  GitBranch,
  Github,
  Loader2,
  LogOut,
  Lock,
  MessagesSquare,
  Moon,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ChatPanel } from "@/components/ChatPanel";
import { ConnectPanel } from "@/components/ConnectPanel";
import { FileExplorer } from "@/components/FileExplorer";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import {
  clearSession,
  loadSession,
  saveSession,
  type Session,
  type TreeNode,
} from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agnes Repo Agent — Agente de IA para projetos GitHub" },
      {
        name: "description",
        content:
          "Conecte seu repositório GitHub e deixe o agente Agnes 2.5 Flash aplicar correções, ajustes e novos componentes com commit e push automáticos.",
      },
      { property: "og:title", content: "Agnes Repo Agent — Agente de IA para projetos GitHub" },
      {
        property: "og:description",
        content:
          "Chat premium para editar repositórios GitHub por IA: leitura da estrutura real, mudanças precisas e push automático.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { theme, toggle } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [tab, setTab] = useState<"chat" | "files">("chat");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  const refreshTree = useCallback(async (s: Session) => {
    setTreeLoading(true);
    try {
      const res = await fetch("/api/repo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "tree",
          token: s.token,
          owner: s.owner,
          repo: s.repo,
          branch: s.branch,
        }),
      });
      const data = (await res.json()) as { tree?: TreeNode[] };
      setTree(data.tree ?? []);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void refreshTree(session);
  }, [session, refreshTree]);

  async function download() {
    if (!session) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/repo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "zip",
          token: session.token,
          owner: session.owner,
          repo: session.repo,
          branch: session.branch,
        }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session.repo}-${session.branch}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <div className="fixed top-4 right-4 z-30">
          <ThemeButton theme={theme} toggle={toggle} />
        </div>
        <ConnectPanel
          onConnect={(s) => {
            saveSession(s);
            setSession(s);
          }}
        />
      </>
    );
  }

  return (
    <div className="app-shell-bg flex h-screen flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface/80 px-3 py-3 backdrop-blur sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/25">
            <Github className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-semibold">
              <a href={session.info.htmlUrl} target="_blank" rel="noreferrer" className="truncate hover:underline">
                {session.info.fullName}
              </a>
              {session.info.private ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : null}
            </p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              <span className="font-mono">{session.branch}</span>
              <span className="hidden sm:inline">· agnes-2.5-flash</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="mr-1 hidden rounded-xl border border-border bg-surface-2/70 p-1 md:flex">
            <TabButton active={tab === "chat"} onClick={() => setTab("chat")} icon={<MessagesSquare className="h-4 w-4" />}>
              Chat
            </TabButton>
            <TabButton active={tab === "files"} onClick={() => setTab("files")} icon={<Code2 className="h-4 w-4" />}>
              Arquivos
            </TabButton>
          </div>
          <Button variant="outline" size="sm" onClick={() => void download()} disabled={downloading}>
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Baixar repo</span>
          </Button>
          <ThemeButton theme={theme} toggle={toggle} />
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              clearSession();
              setSession(null);
              setTree([]);
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Desconectar</span>
          </Button>
        </div>
      </header>

      <div className="flex border-b border-border bg-surface/60 p-2 md:hidden">
        <div className="flex w-full rounded-xl border border-border bg-surface-2/70 p-1">
          <TabButton active={tab === "chat"} onClick={() => setTab("chat")} icon={<MessagesSquare className="h-4 w-4" />} full>
            Chat
          </TabButton>
          <TabButton active={tab === "files"} onClick={() => setTab("files")} icon={<Code2 className="h-4 w-4" />} full>
            Arquivos
          </TabButton>
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
        {tab === "chat" ? (
          <ChatPanel session={session} onChanged={() => void refreshTree(session)} />
        ) : (
          <FileExplorer
            session={session}
            tree={tree}
            loading={treeLoading}
            onRefresh={() => void refreshTree(session)}
          />
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
  full,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        full ? "flex-1" : ""
      } ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function ThemeButton({ theme, toggle }: { theme: string; toggle: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={toggle} title="Alternar tema">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
