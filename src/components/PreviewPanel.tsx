import { AlertTriangle, Loader2, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Session, TreeNode } from "@/lib/session";

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "100%",
  tablet: "834px",
  mobile: "390px",
};

const CODE_EXT = /\.(tsx|ts|jsx|js|mjs)$/i;
const CSS_EXT = /\.css$/i;

async function fetchText(session: Session, path: string): Promise<string | null> {
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
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: string; binaryBase64?: string };
  return typeof data.content === "string" ? data.content : null;
}

function normalize(path: string) {
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Resolve um specifier relativo/alias para um caminho real da árvore do repositório. */
function resolvePath(spec: string, from: string, files: Set<string>): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = normalize(`src/${spec.slice(2)}`);
  else if (spec.startsWith("/")) base = normalize(spec);
  else if (spec.startsWith(".")) base = normalize(`${from.split("/").slice(0, -1).join("/")}/${spec}`);
  else return null;

  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
    `${base}/index.jsx`,
    `${base}/index.js`,
  ];
  return candidates.find((c) => files.has(c)) ?? null;
}

function collectSpecifiers(src: string) {
  const out: string[] = [];
  const re = /(?:from\s*|import\s*|import\(\s*)["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1] as string);
  return out;
}

const RUNTIME = String.raw`
<style>
  body { margin: 0; }
  .preview-loading { 
    display: flex; align-items: center; justify-content: center; 
    height: 100vh; font-family: system-ui, sans-serif; color: #666; 
  }
  .preview-error { 
    padding: 16px; margin: 16px; border-radius: 8px; 
    background: #fee2e2; color: #991b1b; font-family: system-ui, sans-serif; font-size: 14px;
    white-space: pre-wrap; word-break: break-word;
  }
  .preview-warning { 
    padding: 16px; margin: 16px; border-radius: 8px; 
    background: #fef3c7; color: #92400e; font-family: system-ui, sans-serif; font-size: 14px;
  }
</style>
<div class="preview-loading" id="__loader">Carregando...</div>
<script>
  window.__previewError = (msg) => {
    const loader = document.getElementById('__loader');
    if (loader) loader.remove();
    const div = document.createElement('div');
    div.className = 'preview-error';
    div.textContent = 'Erro: ' + String(msg);
    document.body.appendChild(div);
    parent.postMessage({ __preview: "error", msg: String(msg) }, "*");
  };
  window.__previewWarning = (msg) => {
    const div = document.createElement('div');
    div.className = 'preview-warning';
    div.textContent = 'Aviso: ' + String(msg);
    document.body.appendChild(div);
  };
  window.addEventListener("error", (e) => { if (e.message) window.__previewError(e.message); });
  window.addEventListener("unhandledrejection", (e) => window.__previewError(e.reason));
</script>
<script src="https://unpkg.com/@babel/standalone@7.26.4/babel.min.js"></script>
<script>
(function () {
  const FILES = window.__FILES__;
  const ENTRY = window.__ENTRY__;
  const urls = {};
  const compiling = {};
  const loadedModules = {};

  if (!ENTRY || !FILES || !FILES[ENTRY]) {
    window.__previewError('Arquivo de entrada não encontrado: ' + (ENTRY || '(nenhum)'));
    return;
  }

  function isCss(p) { return /\.css$/i.test(p); }

  function bare(spec) {
    if (spec.startsWith("http")) return spec;
    const pkg = spec.split("/")[0];
    const blocked = ["react", "react-dom", "react/jsx-runtime"];
    if (blocked.includes(pkg)) return "data:text/javascript,export default {};export const useState=()=>[];export const useEffect=()=>{};export const useRef=()=>({current:null});export const useCallback=(fn)=>fn;export const useMemo=(fn)=>fn();export const createContext=(v)=>({Provider:{},Consumer:{},_currentValue:v});export const useContext=()=>null;export const Fragment='div';";
    const noBundle = ["lucide-react", "react-markdown", "remark-gfm", "recharts"];
    if (noBundle.includes(pkg)) return "https://esm.sh/" + spec;
    return "https://esm.sh/" + spec + "?dev";
  }

  function compile(path, stack) {
    if (urls[path]) return urls[path];
    if (compiling[path]) return "data:text/javascript,export default {}";
    compiling[path] = true;

    const src = FILES[path];
    if (src === undefined) return "data:text/javascript,export default {}";

    if (isCss(path)) {
      const style = document.createElement("style");
      style.textContent = src;
      document.head.appendChild(style);
      urls[path] = "data:text/javascript,export default {}";
      return urls[path];
    }

    let code;
    try {
      code = Babel.transform(src, {
        filename: path,
        presets: [["react", { runtime: "automatic" }], ["typescript", { isTSX: true, allExtensions: true }]],
        sourceMaps: false,
      }).code;
    } catch (e) {
      window.__previewError("Erro ao compilar " + path + ": " + e.message);
      code = "export default function(){return null}";
    }

    code = code.replace(/(from\s*|import\s*|import\(\s*)(["'])([^"']+)\2/g, function (full, kw, q, spec) {
      const target = FILES.__resolve__[path + "|" + spec];
      if (target) return kw + q + compile(target) + q;
      if (/\.(png|jpe?g|gif|svg|webp|ico|avif)$/i.test(spec) || spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("/")) {
        return kw + q + "data:text/javascript,export default ''" + q;
      }
      return kw + q + bare(spec) + q;
    });

    urls[path] = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    return urls[path];
  }

  try {
    const entryUrl = compile(ENTRY);
    const loader = document.getElementById('__loader');
    if (loader) loader.remove();
    const s = document.createElement("script");
    s.type = "module";
    s.src = entryUrl;
    s.onerror = function(e) {
      window.__previewError("Falha ao carregar módulo de entrada. Verifique se todas as dependências estão instaladas.");
    };
    document.body.appendChild(s);
  } catch (e) {
    window.__previewError("Falha ao inicializar: " + e.message);
  }
})();
</script>
`;

export function PreviewPanel({
  session,
  tree,
  refreshKey,
}: {
  session: Session;
  tree: TreeNode[];
  refreshKey: number;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState("");
  const [entry, setEntry] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const filePaths = useMemo(
    () => new Set(tree.filter((n) => n.type === "blob").map((n) => n.path)),
    [tree],
  );

  const entryOptions = useMemo(() => {
    const preferred = [
      "src/main.tsx",
      "src/main.jsx",
      "src/index.tsx",
      "src/App.tsx",
      "src/routes/index.tsx",
      "index.html",
      "index.tsx",
      "app/page.tsx",
    ].filter((p) => filePaths.has(p));
    const others = [...filePaths].filter(
      (p) =>
        !preferred.includes(p) &&
        /^(src|app|pages|components)\//.test(p) &&
        /\.(tsx|jsx)$/.test(p),
    );
    return [...preferred, ...others.slice(0, 60)];
  }, [filePaths]);

  useEffect(() => {
    if (!entry && entryOptions.length) setEntry(entryOptions[0] as string);
  }, [entry, entryOptions]);

  const build = useCallback(async () => {
    if (!entry) return;
    setLoading(true);
    setError(null);
    setRuntimeError(null);
    try {
      let realEntry = entry;
      let indexHtml: string | null = null;

      if (entry.endsWith(".html")) {
        indexHtml = await fetchText(session, entry);
        const m = indexHtml?.match(/<script[^>]+src=["']([^"']+\.(?:tsx|jsx|ts|js))["']/i);
        const resolved = m?.[1] ? resolvePath(m[1], entry, filePaths) : null;
        if (!resolved) {
          setError("Não encontrei o script de entrada dentro do HTML.");
          setLoading(false);
          return;
        }
        realEntry = resolved;
      }

      const files: Record<string, string> = {};
      const resolveMap: Record<string, string> = {};
      const queue = [realEntry];
      const seen = new Set<string>();
      let fetchErrors = 0;

      while (queue.length && Object.keys(files).length < 120) {
        const path = queue.shift() as string;
        if (seen.has(path)) continue;
        seen.add(path);
        try {
          const src = await fetchText(session, path);
          if (src === null) {
            fetchErrors++;
            continue;
          }
          files[path] = src;
        } catch {
          fetchErrors++;
          continue;
        }
        if (CSS_EXT.test(path)) continue;
        if (!CODE_EXT.test(path)) continue;
        for (const spec of collectSpecifiers(files[path])) {
          const target = resolvePath(spec, path, filePaths);
          if (target) {
            resolveMap[`${path}|${spec}`] = target;
            if (!seen.has(target)) queue.push(target);
          }
        }
      }

      if (Object.keys(files).length === 0) {
        setError("Nenhum arquivo pôde ser carregado do repositório. Verifique as credenciais e a estrutura do projeto.");
        setLoading(false);
        return;
      }

      const payload = JSON.stringify({ ...files, __resolve__: resolveMap });
      const bodyRoot = indexHtml?.match(/<div[^>]+id=["']root["'][^>]*>/i)
        ? `<div id="root"></div>`
        : `<div id="root"></div><div id="app"></div>`;

      setHtml(`<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://cdn.tailwindcss.com"></script>
<style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif}</style>
<script>window.__FILES__ = ${payload.replace(/</g, "\\u003c")}; window.__ENTRY__ = ${JSON.stringify(realEntry)};</script>
</head><body>${bodyRoot}${RUNTIME}</body></html>`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [entry, filePaths, session]);

  useEffect(() => {
    void build();
  }, [build, refreshKey]);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { __preview?: string; msg?: string } | null;
      if (d && d.__preview === "error") setRuntimeError(d.msg ?? "Erro desconhecido");
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <div className="surface-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/70 p-2.5">
        <select
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs outline-none"
        >
          {entryOptions.length === 0 ? <option value="">Nenhum arquivo renderizável</option> : null}
          {entryOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
          {(
            [
              ["desktop", Monitor],
              ["tablet", Tablet],
              ["mobile", Smartphone],
            ] as const
          ).map(([d, Icon]) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`rounded-md p-1.5 transition-colors ${
                device === d ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
              title={d}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => void build()} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      {error || runtimeError ? (
        <div className="flex items-start gap-2 border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{error ?? runtimeError}</span>
        </div>
      ) : null}

      <div className="scroll-slim min-h-0 flex-1 overflow-auto bg-surface-2/40 p-3">
        <div className="mx-auto h-full" style={{ width: DEVICE_WIDTH[device], maxWidth: "100%" }}>
          {loading && !html ? (
            <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Montando preview...
            </div>
          ) : !html ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 text-sm text-muted-foreground">
              <Monitor className="h-8 w-8 opacity-40" />
              <p>Selecione um arquivo de entrada para iniciar o preview</p>
              <Button size="sm" variant="outline" onClick={() => void build()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Gerar preview
              </Button>
            </div>
          ) : (
            <iframe
              ref={frameRef}
              title="Preview do projeto"
              srcDoc={html}
              sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
              className="h-full min-h-[420px] w-full rounded-xl border border-border bg-white shadow-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}
