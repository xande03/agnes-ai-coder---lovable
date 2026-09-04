import { createFileRoute } from "@tanstack/react-router";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";

import { createAgent } from "@/lib/agnes.server";
import {
  base64ToText,
  deleteFile,
  getFile,
  getTree,
  putFile,
  textToBase64,
  type RepoRef,
} from "@/lib/github.server";

type Attachment = { name: string; mimeType: string; dataBase64: string };

type Body = {
  token?: string;
  nvidiaKey?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  attachments?: Attachment[];
};

const TEXT_EXT =
  /\.(tsx?|jsx?|mjs|cjs|json|md|mdx|css|scss|html|yml|yaml|txt|svg|toml|env|sh|py|go|rb|java|php|sql)$/i;

const SYSTEM = `Você é o Brasas Agent, um engenheiro de software autônomo que edita repositórios GitHub reais.

FLUXO OBRIGATÓRIO (nesta ordem, sem exceção):
1. ENTENDER: interprete literalmente o pedido do usuário. Identifique o alvo exato (arquivo, componente, seção, texto, estilo) que ele citou. Se ele citou um texto/rótulo/cor/seção, use search_code para localizar a ocorrência exata antes de qualquer edição.
2. MAPEAR: use list_files (e o mapa do projeto já fornecido) para confirmar onde o alvo vive. Nunca invente caminhos.
3. LER: leia com read_file TODOS os arquivos que serão tocados, inteiros, antes de editar.
4. EDITAR: prefira SEMPRE edit_file (substituição cirúrgica de um trecho exato) para alterações pontuais. Use write_file apenas para arquivos novos ou reescritas totais, e nesse caso envie o conteúdo COMPLETO final.
5. VERIFICAR: após editar, releia o arquivo com read_file para confirmar que a mudança entrou no lugar certo e que nada mais foi perdido.

REGRAS:
- NUNCA pergunte nada e nunca peça confirmação. Aja imediatamente.
- Nunca reescreva um arquivo inteiro para mudar poucas linhas; isso destrói contexto.
- Preserve estilo, indentação, imports, tipagem e o restante do arquivo intacto.
- Respeite a stack real do projeto (framework, router, sistema de estilos). Nada de introduzir libs que o projeto não usa.
- Cada write_file/edit_file/delete_file já faz commit + push automáticos.
- Anexos do usuário vão para o repositório com commit_attachment em um caminho coerente (public/, src/assets/) e depois são referenciados no código.
- Mantenha o contexto da conversa: o usuário pode se referir a mudanças anteriores ("aquele botão", "a mesma seção"). Use o histórico e o registro de arquivos já alterados nesta sessão.
- Responda em português, curto e objetivo: o que mudou, em quais arquivos e em qual trecho.`;

function buildRepoMap(paths: string[]) {
  const top = new Map<string, number>();
  for (const p of paths) {
    const key = p.includes("/") ? `${p.split("/").slice(0, 2).join("/")}/` : p;
    top.set(key, (top.get(key) ?? 0) + 1);
  }
  const summary = [...top.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([k, v]) => (v > 1 ? `${k} (${v})` : k))
    .join(", ");
  const key = paths
    .filter((p) =>
      /^(package\.json|index\.html|vite\.config\.[jt]s|tailwind\.config\.[jt]s|next\.config\.[jt]s|tsconfig\.json|README\.md|src\/(main|App|index|router|styles)\.[a-z]+)$/i.test(
        p,
      ),
    )
    .join(", ");
  return { summary, key };
}

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }

        const { token, nvidiaKey, owner, repo } = body;
        if (!token || !nvidiaKey || !owner || !repo) {
          return Response.json({ error: "Credenciais ausentes (token, nvidiaKey, owner, repo)" }, { status: 400 });
        }
        const branch = body.branch || "main";
        const ref: RepoRef = { token, owner, repo, branch };
        const attachments = body.attachments ?? [];
        const changes: Array<{ action: string; path: string; commitUrl?: string }> = [];

        let allPaths: string[] = [];
        try {
          allPaths = (await getTree(ref, branch)).filter((n) => n.type === "blob").map((n) => n.path);
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 400 });
        }
        const map = buildRepoMap(allPaths);

        const tools = {
          list_files: tool({
            description: "Lista a árvore de arquivos do repositório (caminhos relativos).",
            inputSchema: z.object({
              prefix: z.string().optional().describe("Filtrar por prefixo de caminho"),
            }),
            execute: async ({ prefix }) => {
              const files = allPaths.filter((p) => (prefix ? p.startsWith(prefix) : true));
              return { count: files.length, files: files.slice(0, 800) };
            },
          }),
          search_code: tool({
            description:
              "Procura um texto/trecho literal ou regex dentro dos arquivos de texto do repositório. Use para localizar o lugar exato citado pelo usuário.",
            inputSchema: z.object({
              query: z.string().describe("Texto literal ou expressão regular a procurar"),
              prefix: z.string().optional().describe("Restringir a um diretório"),
              regex: z.boolean().optional(),
            }),
            execute: async ({ query, prefix, regex }) => {
              const re = new RegExp(
                regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "i",
              );
              const candidates = allPaths
                .filter((p) => TEXT_EXT.test(p) && !/node_modules|dist|build|\.lock/.test(p))
                .filter((p) => (prefix ? p.startsWith(prefix) : true))
                .slice(0, 220);
              const hits: Array<{ path: string; line: number; text: string }> = [];
              for (const path of candidates) {
                if (hits.length >= 40) break;
                try {
                  const { base64 } = await getFile(ref, path, branch);
                  const content = base64ToText(base64);
                  if (!re.test(content)) continue;
                  content.split("\n").forEach((text, i) => {
                    if (hits.length < 40 && re.test(text)) {
                      hits.push({ path, line: i + 1, text: text.trim().slice(0, 200) });
                    }
                  });
                } catch {
                  /* ignora binário/erro */
                }
              }
              return { matches: hits.length, hits };
            },
          }),
          read_file: tool({
            description:
              "Lê o conteúdo de um arquivo do repositório com numeração de linhas, para localizar o trecho exato.",
            inputSchema: z.object({ path: z.string() }),
            execute: async ({ path }) => {
              try {
                const { base64 } = await getFile(ref, path, branch);
                const content = base64ToText(base64).slice(0, 120000);
                const numbered = content
                  .split("\n")
                  .map((l, i) => `${i + 1}: ${l}`)
                  .join("\n");
                return { path, lines: content.split("\n").length, content: numbered };
              } catch (e) {
                return { path, error: (e as Error).message };
              }
            },
          }),
          edit_file: tool({
            description:
              "Edição cirúrgica: substitui uma ocorrência EXATA de texto dentro de um arquivo existente (mantendo todo o resto intacto) e faz commit + push. Preferir sempre a write_file.",
            inputSchema: z.object({
              path: z.string(),
              oldText: z
                .string()
                .describe("Trecho exato atual do arquivo, com indentação idêntica"),
              newText: z.string().describe("Trecho novo que substitui o antigo"),
              message: z.string().describe("Mensagem de commit"),
              replaceAll: z.boolean().optional(),
            }),
            execute: async ({ path, oldText, newText, message, replaceAll }) => {
              let current: string;
              try {
                const { base64 } = await getFile(ref, path, branch);
                current = base64ToText(base64);
              } catch (e) {
                return { error: `Não foi possível ler ${path}: ${(e as Error).message}` };
              }
              const occurrences = current.split(oldText).length - 1;
              if (occurrences === 0) {
                return {
                  error:
                    "Trecho não encontrado (compare indentação e quebras de linha). Releia o arquivo com read_file e tente novamente.",
                };
              }
              if (occurrences > 1 && !replaceAll) {
                return {
                  error: `Trecho aparece ${occurrences} vezes. Inclua mais linhas de contexto para torná-lo único ou use replaceAll.`,
                };
              }
              const updated = replaceAll
                ? current.split(oldText).join(newText)
                : current.replace(oldText, newText);
              const r = await putFile(ref, {
                path,
                contentBase64: textToBase64(updated),
                message,
                branch,
              });
              changes.push({ action: "edited", path, commitUrl: r.commitUrl });
              return { ok: true, path, replacements: replaceAll ? occurrences : 1, ...r };
            },
          }),
          write_file: tool({
            description:
              "Cria um arquivo novo ou reescreve um arquivo por completo (conteúdo COMPLETO) e faz commit + push. Não use para alterações pontuais.",
            inputSchema: z.object({
              path: z.string(),
              content: z.string(),
              message: z.string().describe("Mensagem de commit"),
            }),
            execute: async ({ path, content, message }) => {
              const r = await putFile(ref, {
                path,
                contentBase64: textToBase64(content),
                message,
                branch,
              });
              if (r.created && !allPaths.includes(path)) allPaths.push(path);
              changes.push({
                action: r.created ? "created" : "updated",
                path,
                commitUrl: r.commitUrl,
              });
              return { ok: true, ...r };
            },
          }),
          delete_file: tool({
            description: "Remove um arquivo do repositório com commit + push.",
            inputSchema: z.object({ path: z.string(), message: z.string() }),
            execute: async ({ path, message }) => {
              const r = await deleteFile(ref, { path, message, branch });
              allPaths = allPaths.filter((p) => p !== path);
              changes.push({ action: "deleted", path, commitUrl: r.commitUrl });
              return { ok: true, ...r };
            },
          }),
          commit_attachment: tool({
            description:
              "Envia um arquivo/imagem anexado pelo usuário para o repositório (binário preservado) com commit + push.",
            inputSchema: z.object({
              attachmentName: z.string().describe("Nome exato do anexo informado no prompt"),
              path: z.string().describe("Caminho de destino no repositório"),
              message: z.string(),
            }),
            execute: async ({ attachmentName, path, message }) => {
              const att = attachments.find((a) => a.name === attachmentName);
              if (!att) return { error: `Anexo "${attachmentName}" não encontrado` };
              const r = await putFile(ref, {
                path,
                contentBase64: att.dataBase64,
                message,
                branch,
              });
              if (r.created && !allPaths.includes(path)) allPaths.push(path);
              changes.push({
                action: r.created ? "created" : "updated",
                path,
                commitUrl: r.commitUrl,
              });
              return { ok: true, ...r };
            },
          }),
        };

        const history = (body.messages ?? []).slice(-24);
        const messages: ModelMessage[] = history.map((m, i) => {
          const isLastUser = i === history.length - 1 && m.role === "user";
          if (!isLastUser || attachments.length === 0) {
            return { role: m.role, content: m.content } as ModelMessage;
          }
          const parts: Array<Record<string, unknown>> = [
            {
              type: "text",
              text: `${m.content}\n\nAnexos disponíveis: ${attachments
                .map((a) => `${a.name} (${a.mimeType})`)
                .join(", ")}`,
            },
          ];
          for (const a of attachments) {
            if (a.mimeType.startsWith("image/")) {
              parts.push({ type: "image", image: `data:${a.mimeType};base64,${a.dataBase64}` });
            } else if (a.mimeType.startsWith("text/") || a.name.match(/\.(txt|md|json|csv)$/i)) {
              parts.push({
                type: "text",
                text: `Conteúdo de ${a.name}:\n${base64ToText(a.dataBase64).slice(0, 40000)}`,
              });
            }
          }
          return { role: "user", content: parts } as unknown as ModelMessage;
        });

        const context = `Repositório conectado: ${owner}/${repo} (branch ${branch}).
Total de arquivos: ${allPaths.length}.
Mapa de diretórios: ${map.summary}
Arquivos-chave: ${map.key || "(nenhum detectado)"}
Estes dados são reais e atuais — parta deles em vez de supor a estrutura.`;

        try {
          const result = await generateText({
            model: createAgent(nvidiaKey),
            system: `${SYSTEM}\n\n${context}`,
            messages,
            tools,
            maxRetries: 0,
            stopWhen: stepCountIs(40),
          });

          return Response.json({ text: result.text, changes });
        } catch (e) {
          const raw = (e as Error).message ?? "Falha desconhecida";
          const rateLimited = /too many requests|429/i.test(raw);
          const msg = rateLimited
            ? "Limite de requisições da Agnes atingido. Aguarde alguns segundos e envie novamente."
            : raw;
          return Response.json({ error: msg, changes }, { status: rateLimited ? 429 : 500 });
        }
      },
    },
  },
});
