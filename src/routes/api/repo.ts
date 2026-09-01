import { createFileRoute } from "@tanstack/react-router";

import {
  base64ToText,
  downloadZip,
  getFile,
  getRepoInfo,
  getTree,
  type RepoRef,
} from "@/lib/github.server";

type Body = {
  action?: "connect" | "tree" | "file" | "zip";
  token?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  path?: string;
};

export const Route = createFileRoute("/api/repo")({
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
          return Response.json({ error: "Credenciais ausentes" }, { status: 400 });
        }
        const ref: RepoRef = { token, owner, repo };

        try {
          if (body.action === "connect") {
            const info = await getRepoInfo(ref);
            const branch = body.branch || info.defaultBranch;
            const tree = await getTree(ref, branch);
            return Response.json({ info, branch, tree });
          }
          if (body.action === "tree") {
            const branch = body.branch || (await getRepoInfo(ref)).defaultBranch;
            return Response.json({ tree: await getTree(ref, branch), branch });
          }
          if (body.action === "file") {
            const branch = body.branch || "main";
            const { base64 } = await getFile(ref, body.path ?? "", branch);
            const isBinary = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|woff2?|ttf|mp4|mp3)$/i.test(
              body.path ?? "",
            );
            return Response.json(
              isBinary ? { binaryBase64: base64 } : { content: base64ToText(base64) },
            );
          }
          if (body.action === "zip") {
            const branch = body.branch || "main";
            const res = await downloadZip(ref, branch);
            return new Response(res.body, {
              headers: {
                "content-type": "application/zip",
                "content-disposition": `attachment; filename="${repo}-${branch}.zip"`,
              },
            });
          }
          return Response.json({ error: "Ação inválida" }, { status: 400 });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 400 });
        }
      },
    },
  },
});
