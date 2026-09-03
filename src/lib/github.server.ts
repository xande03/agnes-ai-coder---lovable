const API = "https://api.github.com";

export type RepoRef = { token: string; owner: string; repo: string; branch?: string };

async function gh(ref: RepoRef, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${ref.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "Agnes-Agent/1.0",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 500)}`);
  }
  return res;
}

export async function getRepoInfo(ref: RepoRef) {
  const res = await gh(ref, `/repos/${ref.owner}/${ref.repo}`);
  const data = (await res.json()) as Record<string, unknown>;
  return {
    fullName: String(data['full_name']),
    description: (data['description'] as string | null) ?? null,
    defaultBranch: String(data['default_branch']),
    private: Boolean(data['private']),
    htmlUrl: String(data['html_url']),
    stars: Number(data['stargazers_count'] ?? 0),
    language: (data['language'] as string | null) ?? null,
  };
}

export async function getTree(ref: RepoRef, branch: string) {
  const res = await gh(
    ref,
    `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  const data = (await res.json()) as {
    tree?: Array<{ path: string; type: string; size?: number; sha: string }>;
    truncated?: boolean;
  };
  return (data.tree ?? [])
    .filter((n) => n.type === "blob" || n.type === "tree")
    .map((n) => ({ path: n.path, type: n.type, size: n.size ?? 0, sha: n.sha }));
}

export async function getFile(ref: RepoRef, path: string, branch: string) {
  const res = await gh(
    ref,
    `/repos/${ref.owner}/${ref.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
  );
  const data = (await res.json()) as { content?: string; sha: string; encoding?: string };
  const base64 = (data.content ?? "").replace(/\n/g, "");
  return { sha: data.sha, base64 };
}

export function base64ToText(base64: string) {
  const bin = atob(base64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function textToBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

export async function putFile(
  ref: RepoRef,
  args: { path: string; contentBase64: string; message: string; branch: string },
) {
  let sha: string | undefined;
  try {
    sha = (await getFile(ref, args.path, args.branch)).sha;
  } catch {
    sha = undefined;
  }
  const res = await gh(
    ref,
    `/repos/${ref.owner}/${ref.repo}/contents/${args.path.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: args.message,
        content: args.contentBase64,
        branch: args.branch,
        ...(sha ? { sha } : {}),
      }),
    },
  );
  const data = (await res.json()) as { commit?: { sha?: string; html_url?: string } };
  return {
    created: !sha,
    commitSha: data.commit?.sha ?? "",
    commitUrl: data.commit?.html_url ?? "",
  };
}

export async function deleteFile(
  ref: RepoRef,
  args: { path: string; message: string; branch: string },
) {
  const { sha } = await getFile(ref, args.path, args.branch);
  const res = await gh(
    ref,
    `/repos/${ref.owner}/${ref.repo}/contents/${args.path.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "DELETE",
      body: JSON.stringify({ message: args.message, sha, branch: args.branch }),
    },
  );
  const data = (await res.json()) as { commit?: { sha?: string; html_url?: string } };
  return { commitSha: data.commit?.sha ?? "", commitUrl: data.commit?.html_url ?? "" };
}

export async function downloadZip(ref: RepoRef, branch: string) {
  const res = await fetch(
    `${API}/repos/${ref.owner}/${ref.repo}/zipball/${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${ref.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Agnes-Agent/1.0",
      },
    },
  );
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res;
}
