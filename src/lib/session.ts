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
const CHAT_KEY = "agnes-chat";

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
  localStorage.removeItem(CHAT_KEY);
}

export function loadChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

const MAX_CHAT_MESSAGES = 30;
const MAX_ATTACHMENT_PREVIEW_SIZE = 50000; // ~50KB max for preview

function sanitizeMessageForStorage(msg: ChatMessage): ChatMessage {
  if (!msg.attachments?.length) return msg;
  return {
    ...msg,
    attachments: msg.attachments.map((a) => ({
      ...a,
      dataBase64: "", // não salva base64 no localStorage
      preview: a.preview?.slice(0, MAX_ATTACHMENT_PREVIEW_SIZE),
    })),
  };
}

export function saveChat(messages: ChatMessage[]) {
  const trimmed = messages.slice(-MAX_CHAT_MESSAGES);
  const sanitized = trimmed.map(sanitizeMessageForStorage);
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(sanitized));
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      // fallback: salva só as últimas 10 sem anexos
      const minimal = messages.slice(-10).map((m) => ({ ...m, attachments: [] }));
      localStorage.setItem(CHAT_KEY, JSON.stringify(minimal));
    }
  }
}

export function clearChat() {
  localStorage.removeItem(CHAT_KEY);
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
