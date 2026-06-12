ALTER TABLE "reference_images" ADD COLUMN IF NOT EXISTS "shotType" varchar(32) DEFAULT 'other' NOT NULL;
--> statement-breakpoint
ALTER TABLE "reference_images" ADD COLUMN IF NOT EXISTS "expression" varchar(32) DEFAULT 'neutral' NOT NULL;
--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "expressionTone" varchar(64) DEFAULT 'subtle_natural' NOT NULL;
--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "expressionNotes" text;
