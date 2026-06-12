ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "voiceSampleKey" varchar(512);
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "voiceSampleUrl" varchar(1024);
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "voiceSampleDescription" text;
