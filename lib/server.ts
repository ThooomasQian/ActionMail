import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const MAX_FILE_BYTES = 12 * 1024 * 1024;

export async function requireApiContext() {
  const user = await getChatGPTUser();
  if (!user) return null;
  if (!env.DB || !env.BUCKET) {
    throw new Error("ActionMail storage bindings are unavailable.");
  }
  return { user, db: env.DB, bucket: env.BUCKET };
}

export function apiError(code: string, message: string, status: number) {
  return Response.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export function privateJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(body, { ...init, headers });
}

export function normalizeMime(type: string) {
  return type === "image/jpg" ? "image/jpeg" : type.toLowerCase();
}

export function magicMatches(bytes: Uint8Array, mime: string) {
  if (mime === "text/plain") return true;
  if (mime === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (mime === "image/png") {
    return [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  }
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/webp") {
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

export async function sha256Hex(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
