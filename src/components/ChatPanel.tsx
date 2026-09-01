import {
  ArrowUp,
  Bot,
  CheckCircle2,
  FileUp,
  Loader2,
  Paperclip,
  Sparkles,
  Trash2,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { fileToAttachment, type Attachment, type ChatMessage, type Session } from "@/lib/session";

const SUGGESTIONS = [
  "Analise a estrutura do projeto e corrija erros óbvios",
  "Adicione um cabeçalho responsivo na página inicial",
  "Crie um README completo para este repositório",
];

export function ChatPanel({
  session,
  onChanged,
}: {
  session: Session;
  onChanged: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function addFiles(list: FileList | File[]) {
    const arr = Array.from(list).slice(0, 8);
    const next = await Promise.all(arr.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...next].slice(0, 8));
  }

  async function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || "(anexos enviados)",
      attachments,
    };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    const sent = attachments;
    setAttachments([]);
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: session.token,
          owner: session.owner,
          repo: session.repo,
          branch: session.branch,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          attachments: sent.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            dataBase64: a.dataBase64,
          })),
        }),
      });
      const data = (await res.json()) as {
        text?: string;
        changes?: ChatMessage["changes"];
        error?: string;
      };
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.error ? `Erro: ${data.error}` : (data.text ?? "Concluído."),
          changes: data.changes ?? [],
          error: Boolean(data.error),
        },
      ]);
      if ((data.changes ?? []).length > 0) onChanged();
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Erro de rede: ${(e as Error).message}`,
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="surface-panel relative flex h-full min-h-0 flex-col overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
      }}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/85 text-primary">
          <FileUp className="h-7 w-7" />
          <p className="text-sm font-medium">Solte imagens ou arquivos aqui</p>
        </div>
      ) : null}

      <div className="scroll-slim min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">O que vamos mudar hoje?</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Descreva a correção, ajuste ou novo componente. O agente lê o projeto, aplica a
                mudança no local exato e faz commit + push sozinho.
              </p>
            </div>
            <div className="flex w-full max-w-md flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                    taRef.current?.focus();
                  }}
                  className="rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex gap-3">
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${
                  m.role === "user"
                    ? "bg-secondary text-secondary-foreground ring-border"
                    : "bg-primary/12 text-primary ring-primary/25"
                }`}
              >
                {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {m.role === "user" ? "Você" : "Agnes 2.5 Flash"}
                </p>
                {m.role === "user" ? (
                  <div className="inline-block max-w-full rounded-xl bg-primary px-3.5 py-2 text-sm break-words text-primary-foreground">
                    {m.content}
                  </div>
                ) : (
                  <div
                    className={`prose-chat max-w-none break-words ${m.error ? "text-destructive" : ""}`}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                )}

                {m.attachments && m.attachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((a) => (
                      <span
                        key={a.name}
                        className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs"
                      >
                        {a.preview ? (
                          <img src={a.preview} alt={a.name} className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <Paperclip className="h-3.5 w-3.5" />
                        )}
                        <span className="max-w-[10rem] truncate font-mono">{a.name}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                {m.changes && m.changes.length > 0 ? (
                  <div className="mt-3 space-y-1.5 rounded-xl border border-success/30 bg-success/8 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Commit + push enviados
                    </p>
                    {m.changes.map((c, i) => (
                      <a
                        key={`${c.path}-${i}`}
                        href={c.commitUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-xs hover:underline"
                      >
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                          {c.action}
                        </span>
                        <span className="truncate font-mono">{c.path}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}

        {busy ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/25">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            Analisando o repositório e aplicando as mudanças...
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border bg-surface p-3 sm:p-4">
        {attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <span
                key={`${a.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs"
              >
                {a.preview ? (
                  <img src={a.preview} alt={a.name} className="h-7 w-7 rounded object-cover" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" />
                )}
                <span className="max-w-[9rem] truncate font-mono">{a.name}</span>
                <button
                  onClick={() => setAttachments((p) => p.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface-2/60 p-2 focus-within:border-primary/50">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => fileRef.current?.click()}
            title="Anexar arquivos"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Descreva a mudança... (cole ou arraste imagens e arquivos)"
            className="max-h-44 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {messages.length > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setMessages([])}
              title="Limpar conversa"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            size="icon"
            className="shrink-0"
            onClick={() => void send()}
            disabled={busy || (!input.trim() && attachments.length === 0)}
            title="Enviar"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <TriangleAlert className="h-3 w-3" />
          O agente aplica commits diretamente na branch{" "}
          <span className="font-mono">{session.branch}</span>.
        </p>
      </div>
    </div>
  );
}
