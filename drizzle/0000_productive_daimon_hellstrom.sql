CREATE TABLE `action_items` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text NOT NULL,
	`client_key` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`organization` text,
	`due_date` text,
	`amount_minor` integer,
	`currency` text,
	`confidence` integer DEFAULT 0 NOT NULL,
	`source_quote` text DEFAULT '' NOT NULL,
	`review_state` text DEFAULT 'confirmed' NOT NULL,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	`completed_at_ms` integer,
	`archived_at_ms` integer,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_items_document_client_unique` ON `action_items` (`document_id`,`client_key`);--> statement-breakpoint
CREATE INDEX `action_items_document_idx` ON `action_items` (`document_id`,`user_id`,`position`);--> statement-breakpoint
CREATE INDEX `action_items_owner_due_idx` ON `action_items` (`user_id`,`completed_at_ms`,`archived_at_ms`,`due_date`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`content_sha256` text NOT NULL,
	`r2_key` text NOT NULL,
	`extraction_mode` text NOT NULL,
	`text_excerpt` text DEFAULT '' NOT NULL,
	`processing_state` text DEFAULT 'ready' NOT NULL,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	`archived_at_ms` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_r2_key_unique` ON `documents` (`r2_key`);--> statement-breakpoint
CREATE INDEX `documents_owner_active_idx` ON `documents` (`user_id`,`archived_at_ms`,`updated_at_ms`);--> statement-breakpoint
CREATE INDEX `documents_owner_hash_idx` ON `documents` (`user_id`,`content_sha256`);