import { draftActionsSchema } from "@/lib/actionmail-types";
import { apiError, magicMatches, MAX_FILE_BYTES, normalizeMime, privateJson, requireApiContext, sha256Hex } from "@/lib/server";

export const dynamic = "force-dynamic";

const allowedMime = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"]);
const allowedModes = new Set(["pdf-text", "image-ocr", "plain-text"]);

export async function POST(request: Request) {
  const context = await requireApiContext();
  if (!context) return apiError("UNAUTHENTICATED", "Sign in to save documents.", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("INVALID_FORM", "The upload could not be read.", 400);
  }

  const file = form.get("file");
  const extractedText = form.get("extractedText");
  const extractionMode = form.get("extractionMode");
  const actionsJson = form.get("actions");
  if (!(file instanceof File) || typeof extractedText !== "string" || typeof extractionMode !== "string" || typeof actionsJson !== "string") {
    return apiError("MISSING_FIELDS", "File, extraction text, mode, and actions are required.", 400);
  }
  if (file.size < 1 || file.size > MAX_FILE_BYTES) {
    return apiError("FILE_SIZE", "Choose a file between 1 byte and 12 MB.", 413);
  }
  if (extractedText.length > 120_000) {
    return apiError("TEXT_TOO_LONG", "Extracted text is limited to 120,000 characters.", 413);
  }

  const mimeType = normalizeMime(file.type || "");
  if (!allowedMime.has(mimeType) || !allowedModes.has(extractionMode)) {
    return apiError("UNSUPPORTED_FILE", "Use PDF, PNG, JPEG, WebP, or plain text.", 415);
  }

  let actions;
  try {
    actions = draftActionsSchema.parse(JSON.parse(actionsJson));
  } catch {
    return apiError("INVALID_ACTIONS", "One or more action fields are invalid.", 422);
  }
  if (!actions.length) return apiError("NO_ACTIONS", "Keep at least one action before saving.", 422);
  const normalizedText = extractedText.toLowerCase().replace(/\s+/g, " ").trim();
  if (actions.some((action) => {
    const quote = action.sourceQuote.toLowerCase().replace(/\s+/g, " ").trim();
    return quote && !normalizedText.includes(quote);
  })) {
    return apiError("EVIDENCE_MISMATCH", "An action quote no longer matches the extracted text.", 422);
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!magicMatches(bytes, mimeType)) {
    return apiError("FILE_SIGNATURE", "The file contents do not match its declared type.", 415);
  }

  const documentId = crypto.randomUUID();
  const r2Key = `documents/${documentId}/original`;
  const now = Date.now();
  const contentSha256 = await sha256Hex(buffer);

  await context.bucket.put(r2Key, buffer, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { sha256: contentSha256 },
  });

  try {
    const statements: D1PreparedStatement[] = [
      context.db.prepare(`INSERT INTO documents
        (id, user_id, original_name, mime_type, size_bytes, content_sha256, r2_key,
         extraction_mode, text_excerpt, processing_state, created_at_ms, updated_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`)
        .bind(documentId, context.user.userId, file.name.slice(0, 240), mimeType, file.size,
          contentSha256, r2Key, extractionMode, extractedText.slice(0, 12_000), now, now),
      ...actions.map((action, position) => context.db.prepare(`INSERT INTO action_items
        (id, document_id, user_id, client_key, position, title, organization, due_date,
         amount_minor, currency, confidence, source_quote, review_state, created_at_ms, updated_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`)
        .bind(crypto.randomUUID(), documentId, context.user.userId, action.clientKey, position,
          action.title, action.organization ?? null, action.dueDate ?? null,
          action.amountMinor ?? null, action.currency ?? null, action.confidence,
          action.sourceQuote, now, now)),
    ];
    await context.db.batch(statements);
  } catch (error) {
    await context.bucket.delete(r2Key);
    console.error("ActionMail persistence failed", error);
    return apiError("SAVE_FAILED", "The document could not be saved. Please retry.", 500);
  }

  return privateJson({ documentId, actionCount: actions.length }, { status: 201 });
}
