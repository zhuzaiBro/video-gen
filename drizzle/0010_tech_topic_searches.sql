CREATE TABLE IF NOT EXISTS "tech_topic_searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"query" varchar(512),
	"topics" json NOT NULL,
	"topicCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tech_topic_searches" ADD CONSTRAINT "tech_topic_searches_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tech_topic_searches_user_created_idx" ON "tech_topic_searches" ("userId", "createdAt" DESC);
