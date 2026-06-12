ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "heightCm" integer;
--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "weightKg" integer;
--> statement-breakpoint
ALTER TABLE "reference_images" ADD COLUMN IF NOT EXISTS "faceCropKey" varchar(512);
--> statement-breakpoint
ALTER TABLE "reference_images" ADD COLUMN IF NOT EXISTS "faceCropUrl" varchar(1024);
--> statement-breakpoint
ALTER TABLE "reference_images" ADD COLUMN IF NOT EXISTS "bodyCropKey" varchar(512);
--> statement-breakpoint
ALTER TABLE "reference_images" ADD COLUMN IF NOT EXISTS "bodyCropUrl" varchar(1024);
