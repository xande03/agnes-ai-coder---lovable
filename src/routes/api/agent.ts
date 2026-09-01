import { createFileRoute } from "@tanstack/react-router";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";

import { createAgnes } from "@/lib/agnes.server";
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
  owner?: string;
  repo?: string;
  branch?: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  attachments?: Attachment[];
};

const SYSTEM = `Você é o Agnes, um agente de engenharia de software autônomo que edita repositórios GitHub reais.

REGRAS OBRIGATÓRIAS:
- NUNCA pergunte nada ao usuário e nunca peça confirmação. Aja imediatamente.
- Sempre comece inspecionando a estrutura real do projeto com list_files e leia com read_file os arquivos exatos que serão alterados.
- Faça a alteração no local exato do código, preservando estilo, indentação, imports e o restante do arquivo intacto. Ao usar write_file você envia o conteúdo COMPLETO do arquivo final.
- Cada write_file/delete_file já executa commit + push automáticos no GitHub.
- Se o usuário anexou arquivos ou imagens, use commit_attachment para adicioná-los ao repositório em um caminho coerente (ex: public/, src/assets/) e depois referencie-os no código com write_file.
- Responda em português, de forma curta e objetiva, listando os arquivos alterados e o que mudou.`;

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

        const { token, owner, repo } = body;
        if (!token || !owner || !repo) {
          return Response.json({ error: "Credenciais do repositório ausentes" }, { status: 400 });
        }
        const branch = body.branch || "main";
        const ref: RepoRef = { token, owner, repo, branch };
        const attachments = body.attachments ?? [];
        const changes: Array<{ action: string; path: string; commitUrl?: string }> = [];

        const tools = {
          list_files: tool({
            description: "Lista a árvore de arquivos do repositório (caminhos relativos).",
            inputSchema: z.object({
              prefix: z.string().optional().describe("Filtrar por prefixo de caminho"),
            }),
            execute: async ({ prefix }) => {
              const tree = await getTree(ref, branch);
              const files = tree
                .filter((n) => n.type === "blob")
                .map((n) => n.path)
                .filter((p) => (prefix ? p.startsWith(prefix) : true));
              return { count: files.length, files: files.slice(0, 800) };
            },
          }),
          read_file: tool({
            description: "Lê o conteúdo de texto de um arquivo do repositório.",
            inputSchema: z.object({ path: z.string() }),
            execute: async ({ path }) => {
              try {
                const { base64 } = await getFile(ref, path, branch);
                return { path, content: base64ToText(base64).slice(0, 120000) };
              } catch (e) {
                return { path, error: (e as Error).message };
              }
            },
          }),
          write_file: tool({
            description:
              "Cria ou substitui um arquivo de texto com o conteúdo COMPLETO e faz commit + push.",
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
              changes.push({
                action: r.created ? "created" : "updated",
                path,
                commitUrl: r.commitUrl,
              });
              return { ok: true, ...r };
            },
          }),
        };

        const history = (body.messages ?? []).slice(-16);
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

        try {
          const result = await generateText({
            model: createAgnes(),
            system: `${SYSTEM}\n\nRepositório conectado: ${owner}/${repo} (branch ${branch}).`,
            messages,
            tools,
            stopWhen: stepCountIs(40),
          });

          return Response.json({ text: result.text, changes });
        } catch (e) {
          const msg = (e as Error).message ?? "Falha desconhecida";
          return Response.json({ error: msg, changes }, { status: 500 });
        }
      },
    },
  },
});
