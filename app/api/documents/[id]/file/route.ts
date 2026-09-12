import { apiError, requireApiContext } from "@/lib/server";

export const dynamic = "force-dynamic";

type FileRow = { r2_key: string; original_name: string; mime_type: string };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireApiContext();
  if (!context) return apiError("UNAUTHENTICATED", "Sign in to download documents.", 401);
  const { id } = await params;
  const row = await context.db
    .prepare("SELECT r2_key, original_name, mime_type FROM documents WHERE id = ? AND user_id = ?")
    .bind(id, context.user.userId)
    .first<FileRow>();
  if (!row) return apiError("NOT_FOUND", "Document not found.", 404);
  const object = await context.bucket.get(row.r2_key);
  if (!object) return apiError("FILE_MISSING", "The stored file is unavailable.", 404);

  const safeName = row.original_name.replace(/["\\\r\n]/g, "_");
  return new Response(object.body, {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Length": object.size.toString(),
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      ETag: object.httpEtag,
    },
  });
}
