CREATE TYPE "public"."generation_mode" AS ENUM('prompt', 'reference_image', 'persona_agent');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "generated_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"taskId" integer NOT NULL,
	"userId" integer NOT NULL,
	"videoKey" varchar(512) NOT NULL,
	"videoUrl" varchar(1024) NOT NULL,
	"duration" integer,
	"resolution" varchar(50),
	"aspectRatio" varchar(10),
	"fileSize" integer,
	"title" varchar(255),
	"description" text,
	"isFavorite" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"personality" text,
	"voiceStyle" varchar(255),
	"backgroundStory" text,
	"referenceImageKey" varchar(512),
	"referenceImageUrl" varchar(1024),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"personaId" integer NOT NULL,
	"imageKey" varchar(512) NOT NULL,
	"imageUrl" varchar(1024) NOT NULL,
	"uploadedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "video_generation_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"personaId" integer,
	"mode" "generation_mode" NOT NULL,
	"prompt" text NOT NULL,
	"expandedPrompt" text,
	"referenceImageKeys" json,
	"videoParams" json,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"geminiOperationName" varchar(512),
	"generatedVideoKey" varchar(512),
	"generatedVideoUrl" varchar(1024),
	"errorMessage" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"startedAt" timestamp,
	"completedAt" timestamp,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generated_videos" ADD CONSTRAINT "generated_videos_taskId_video_generation_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."video_generation_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_videos" ADD CONSTRAINT "generated_videos_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_personaId_personas_id_fk" FOREIGN KEY ("personaId") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_generation_tasks" ADD CONSTRAINT "video_generation_tasks_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_generation_tasks" ADD CONSTRAINT "video_generation_tasks_personaId_personas_id_fk" FOREIGN KEY ("personaId") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;