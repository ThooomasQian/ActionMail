import { requireApiContext, apiError, privateJson } from "@/lib/server";

export const dynamic = "force-dynamic";

type DocumentRow = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  extraction_mode: string;
  created_at_ms: number;
  action_count: number;
};

type ActionRow = {
  id: string;
  document_id: string;
  document_name: string;
  client_key: string;
  title: string;
  organization: string | null;
  due_date: string | null;
  amount_minor: number | null;
  currency: string | null;
  confidence: number;
  source_quote: string;
  completed_at_ms: number | null;
  archived_at_ms: number | null;
  created_at_ms: number;
};

export async function GET() {
  const context = await requireApiContext();
  if (!context) return apiError("UNAUTHENTICATED", "Sign in to use ActionMail.", 401);

  const [documentResult, actionResult] = await Promise.all([
    context.db
      .prepare(`SELECT d.id, d.original_name, d.mime_type, d.size_bytes, d.extraction_mode,
        d.created_at_ms, COUNT(a.id) AS action_count
        FROM documents d LEFT JOIN action_items a ON a.document_id = d.id AND a.user_id = d.user_id
        WHERE d.user_id = ? AND d.archived_at_ms IS NULL
        GROUP BY d.id ORDER BY d.created_at_ms DESC LIMIT 50`)
      .bind(context.user.userId)
      .all<DocumentRow>(),
    context.db
      .prepare(`SELECT a.id, a.document_id, d.original_name AS document_name, a.client_key,
        a.title, a.organization, a.due_date, a.amount_minor, a.currency, a.confidence,
        a.source_quote, a.completed_at_ms, a.archived_at_ms, a.created_at_ms
        FROM action_items a JOIN documents d ON d.id = a.document_id AND d.user_id = a.user_id
        WHERE a.user_id = ? AND a.archived_at_ms IS NULL AND a.review_state = 'confirmed'
        ORDER BY a.completed_at_ms IS NOT NULL, a.due_date IS NULL, a.due_date, a.created_at_ms DESC
        LIMIT 100`)
      .bind(context.user.userId)
      .all<ActionRow>(),
  ]);

  return privateJson({
    documents: documentResult.results.map((row) => ({
      id: row.id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      extractionMode: row.extraction_mode,
      createdAtMs: row.created_at_ms,
      actionCount: Number(row.action_count),
    })),
    actionItems: actionResult.results.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      clientKey: row.client_key,
      title: row.title,
      organization: row.organization,
      dueDate: row.due_date,
      amountMinor: row.amount_minor,
      currency: row.currency,
      confidence: row.confidence,
      sourceQuote: row.source_quote,
      completedAtMs: row.completed_at_ms,
      archivedAtMs: row.archived_at_ms,
      createdAtMs: row.created_at_ms,
    })),
  });
}
