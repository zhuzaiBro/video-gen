CREATE TABLE "video_scripts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"personaId" integer,
	"sourceUrl" varchar(2048) NOT NULL,
	"platform" varchar(32),
	"title" varchar(512),
	"rawTranscript" text,
	"decomposedScript" json,
	"summary" text,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"errorMessage" text,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_scripts" ADD CONSTRAINT "video_scripts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "video_scripts" ADD CONSTRAINT "video_scripts_personaId_personas_id_fk" FOREIGN KEY ("personaId") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "video_scripts_user_created_idx" ON "video_scripts" ("userId", "createdAt" DESC);
