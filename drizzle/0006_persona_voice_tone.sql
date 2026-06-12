-- 人设音色预设（可灵口播/配音风格）
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "voiceTone" varchar(64);
