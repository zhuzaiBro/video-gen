-- Persona profile: self introduction & Douyin homepage
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "selfIntroduction" text;
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "douyinProfileUrl" varchar(1024);
