export type RepoInfo = {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
  stars: number;
  language: string | null;
};

export type TreeNode = { path: string; type: string; size: number; sha: string };

export type Session = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  info: RepoInfo;
};

export type Attachment = {
  name: string;
  mimeType: string;
  dataBase64: string;
  preview?: string | undefined;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  changes?: Array<{ action: string; path: string; commitUrl?: string }>;
  error?: boolean;
};

const KEY = "agnes-session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 8192) {
    bin += String.fromCharCode(...buf.subarray(i, i + 8192));
  }
  const dataBase64 = btoa(bin);
  const mimeType = file.type || "application/octet-stream";
  return {
    name: file.name,
    mimeType,
    dataBase64,
    preview: mimeType.startsWith("image/") ? `data:${mimeType};base64,${dataBase64}` : undefined,
  };
}
