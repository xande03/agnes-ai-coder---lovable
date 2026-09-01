import { File as FileIcon, Folder, Loader2, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Session, TreeNode } from "@/lib/session";

export function FileExplorer({
  session,
  tree,
  loading,
  onRefresh,
}: {
  session: Session;
  tree: TreeNode[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const files = useMemo(
    () =>
      tree
        .filter((n) => n.type === "blob")
        .filter((n) => n.path.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 500),
    [tree, query],
  );

  async function open(path: string) {
    setSelected(path);
    setContent(null);
    setImageSrc(null);
    setFileLoading(true);
    try {
      const res = await fetch("/api/repo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "file",
          token: session.token,
          owner: session.owner,
          repo: session.repo,
          branch: session.branch,
          path,
        }),
      });
      const data = (await res.json()) as {
        content?: string;
        binaryBase64?: string;
        error?: string;
      };
      if (data.content !== undefined) setContent(data.content);
      else if (data.binaryBase64 && /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(path))
        setImageSrc(`data:image/${path.split(".").pop()};base64,${data.binaryBase64}`);
      else setContent(data.error ?? "Arquivo binário — pré-visualização indisponível.");
    } catch (e) {
      setContent((e as Error).message);
    } finally {
      setFileLoading(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="surface-panel flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar arquivos..."
              className="pl-9"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={onRefresh} title="Atualizar">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-2">
          {files.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum arquivo encontrado.</p>
          ) : (
            files.map((f) => (
              <button
                key={f.path}
                onClick={() => open(f.path)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  selected === f.path
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <FileIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate font-mono">{f.path}</span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {tree.filter((n) => n.type === "blob").length} arquivos · branch {session.branch}
        </div>
      </div>

      <div className="surface-panel flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Folder className="h-4 w-4 text-primary" />
          <span className="truncate font-mono text-xs sm:text-sm">
            {selected ?? "Selecione um arquivo"}
          </span>
        </div>
        <div className="scroll-slim min-h-0 flex-1 overflow-auto p-4">
          {fileLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : imageSrc ? (
            <img src={imageSrc} alt={selected ?? ""} className="max-w-full rounded-lg border" />
          ) : content !== null ? (
            <pre className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">
              {content}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Abra um arquivo à esquerda para visualizar seu conteúdo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
