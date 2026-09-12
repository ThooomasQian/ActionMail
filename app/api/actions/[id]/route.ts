import { apiError, privateJson, requireApiContext } from "@/lib/server";

export const dynamic = "force-dynamic";

type PatchBody = {
  completed?: boolean;
  archived?: boolean;
  title?: string;
  dueDate?: string | null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireApiContext();
  if (!context) return apiError("UNAUTHENTICATED", "Sign in to update actions.", 401);
  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return apiError("INVALID_JSON", "The update could not be read.", 400);
  }

  const now = Date.now();
  const fields: string[] = ["updated_at_ms = ?"];
  const values: unknown[] = [now];
  if (typeof body.completed === "boolean") {
    fields.push("completed_at_ms = ?");
    values.push(body.completed ? now : null);
  }
  if (typeof body.archived === "boolean") {
    fields.push("archived_at_ms = ?");
    values.push(body.archived ? now : null);
  }
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title || title.length > 160) return apiError("INVALID_TITLE", "Titles must be 1–160 characters.", 422);
    fields.push("title = ?");
    values.push(title);
  }
  if (body.dueDate === null || typeof body.dueDate === "string") {
    if (body.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
      return apiError("INVALID_DATE", "Use an ISO date such as 2026-09-24.", 422);
    }
    fields.push("due_date = ?");
    values.push(body.dueDate);
  }
  if (fields.length === 1) return apiError("NO_CHANGES", "No supported changes were supplied.", 400);

  values.push(id, context.user.userId);
  const result = await context.db
    .prepare(`UPDATE action_items SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();
  if (!result.meta.changes) return apiError("NOT_FOUND", "Action not found.", 404);
  return privateJson({ ok: true, updatedAtMs: now });
}
