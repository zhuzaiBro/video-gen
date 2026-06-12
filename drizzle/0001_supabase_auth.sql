-- Migrate Manus OAuth (openId) to Supabase Auth (supabaseId)
ALTER TABLE "users" RENAME COLUMN "openId" TO "supabaseId";
ALTER TABLE "users" ALTER COLUMN "supabaseId" TYPE varchar(36);
