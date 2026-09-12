import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentSha256: text("content_sha256").notNull(),
    r2Key: text("r2_key").notNull(),
    extractionMode: text("extraction_mode").notNull(),
    textExcerpt: text("text_excerpt").notNull().default(""),
    processingState: text("processing_state").notNull().default("ready"),
    createdAtMs: integer("created_at_ms").notNull(),
    updatedAtMs: integer("updated_at_ms").notNull(),
    archivedAtMs: integer("archived_at_ms"),
  },
  (table) => [
    uniqueIndex("documents_r2_key_unique").on(table.r2Key),
    index("documents_owner_active_idx").on(
      table.userId,
      table.archivedAtMs,
      table.updatedAtMs,
    ),
    index("documents_owner_hash_idx").on(table.userId, table.contentSha256),
  ],
);

export const actionItems = sqliteTable(
  "action_items",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    clientKey: text("client_key").notNull(),
    position: integer("position").notNull().default(0),
    title: text("title").notNull(),
    organization: text("organization"),
    dueDate: text("due_date"),
    amountMinor: integer("amount_minor"),
    currency: text("currency"),
    confidence: integer("confidence").notNull().default(0),
    sourceQuote: text("source_quote").notNull().default(""),
    reviewState: text("review_state").notNull().default("confirmed"),
    createdAtMs: integer("created_at_ms").notNull(),
    updatedAtMs: integer("updated_at_ms").notNull(),
    completedAtMs: integer("completed_at_ms"),
    archivedAtMs: integer("archived_at_ms"),
  },
  (table) => [
    uniqueIndex("action_items_document_client_unique").on(
      table.documentId,
      table.clientKey,
    ),
    index("action_items_document_idx").on(
      table.documentId,
      table.userId,
      table.position,
    ),
    index("action_items_owner_due_idx").on(
      table.userId,
      table.completedAtMs,
      table.archivedAtMs,
      table.dueDate,
    ),
  ],
);

export type DocumentRecord = typeof documents.$inferSelect;
export type ActionItemRecord = typeof actionItems.$inferSelect;
