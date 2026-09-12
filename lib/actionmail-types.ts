import { z } from "zod";

export const draftActionSchema = z.object({
  clientKey: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  organization: z.string().trim().max(120).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  amountMinor: z.number().int().min(0).max(100_000_000_00).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
  confidence: z.number().int().min(0).max(100),
  sourceQuote: z.string().trim().max(500),
});

export const draftActionsSchema = z.array(draftActionSchema).max(30);

export type DraftAction = z.infer<typeof draftActionSchema>;

export type ActionItemView = DraftAction & {
  id: string;
  documentId: string;
  documentName: string;
  completedAtMs: number | null;
  archivedAtMs: number | null;
  createdAtMs: number;
};

export type DocumentView = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  extractionMode: string;
  createdAtMs: number;
  actionCount: number;
};

export type InboxResponse = {
  documents: DocumentView[];
  actionItems: ActionItemView[];
};

export type ExtractionResult = {
  text: string;
  mode: "pdf-text" | "image-ocr" | "plain-text";
  pageCount?: number;
  ocrConfidence?: number;
};
