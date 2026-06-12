-- Per-user Kling AI API credentials (frontend-configurable)
CREATE TABLE IF NOT EXISTS "kling_settings" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "accessKey" varchar(128) NOT NULL DEFAULT '',
  "secretKey" varchar(256) NOT NULL DEFAULT '',
  "apiBaseUrl" varchar(512) NOT NULL DEFAULT 'https://api.klingai.com',
  "modelName" varchar(64) NOT NULL DEFAULT 'kling-v2-6',
  "defaultMode" varchar(16) NOT NULL DEFAULT 'std',
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "kling_settings_userId_idx" ON "kling_settings" ("userId");
