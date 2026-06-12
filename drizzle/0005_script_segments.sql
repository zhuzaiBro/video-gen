-- 分镜定义：脚本拆解后的每个片段（持久化 decomposedScript.segments）
CREATE TABLE "script_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"scriptId" integer NOT NULL,
	"segmentIndex" integer NOT NULL,
	"startSec" double precision DEFAULT 0 NOT NULL,
	"endSec" double precision DEFAULT 5 NOT NULL,
	"spokenText" text,
	"visualDescription" text,
	"purpose" varchar(128),
	"klingDurationSec" integer DEFAULT 5 NOT NULL,
	"assemblyOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "script_segments_scriptId_segmentIndex_unique" UNIQUE("scriptId", "segmentIndex")
);
--> statement-breakpoint
-- 分镜生成记录：每次「立即生成 / 重新生成」一条，支持历史与微调
CREATE TABLE "script_segment_generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"segmentId" integer NOT NULL,
	"scriptId" integer NOT NULL,
	"taskId" integer,
	"personaId" integer,
	"userPrompt" text NOT NULL,
	"expandedPrompt" text,
	"referenceImageUrls" json,
	"referenceImageKeys" json,
	"duration" integer,
	"resolution" varchar(50) DEFAULT '720p',
	"aspectRatio" varchar(10) DEFAULT '16:9',
	"sound" boolean DEFAULT true NOT NULL,
	"modelName" varchar(64) DEFAULT 'kling-v3',
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"videoKey" varchar(512),
	"videoUrl" varchar(1024),
	"errorMessage" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- 成片整合：ffmpeg 合并后的完整视频（可保留多次整合历史）
CREATE TABLE "script_assemblies" (
	"id" serial PRIMARY KEY NOT NULL,
	"scriptId" integer NOT NULL,
	"userId" integer NOT NULL,
	"videoKey" varchar(512) NOT NULL,
	"videoUrl" varchar(1024) NOT NULL,
	"segmentOrder" json NOT NULL,
	"segmentGenerationIds" json,
	"duration" integer,
	"status" "task_status" DEFAULT 'completed' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_scripts" ADD COLUMN "activeAssemblyId" integer;
--> statement-breakpoint
ALTER TABLE "script_segments" ADD CONSTRAINT "script_segments_scriptId_video_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."video_scripts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "script_segment_generations" ADD CONSTRAINT "script_segment_generations_segmentId_script_segments_id_fk" FOREIGN KEY ("segmentId") REFERENCES "public"."script_segments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "script_segment_generations" ADD CONSTRAINT "script_segment_generations_scriptId_video_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."video_scripts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "script_segment_generations" ADD CONSTRAINT "script_segment_generations_taskId_video_generation_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."video_generation_tasks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "script_segment_generations" ADD CONSTRAINT "script_segment_generations_personaId_personas_id_fk" FOREIGN KEY ("personaId") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "script_assemblies" ADD CONSTRAINT "script_assemblies_scriptId_video_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."video_scripts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "script_assemblies" ADD CONSTRAINT "script_assemblies_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "video_scripts" ADD CONSTRAINT "video_scripts_activeAssemblyId_script_assemblies_id_fk" FOREIGN KEY ("activeAssemblyId") REFERENCES "public"."script_assemblies"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "script_segments_script_order_idx" ON "script_segments" ("scriptId", "assemblyOrder");
--> statement-breakpoint
CREATE INDEX "script_segment_generations_segment_idx" ON "script_segment_generations" ("segmentId", "createdAt" DESC);
--> statement-breakpoint
CREATE INDEX "script_segment_generations_script_status_idx" ON "script_segment_generations" ("scriptId", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "script_segment_generations_one_active_per_segment" ON "script_segment_generations" ("segmentId") WHERE "isActive" = true;
--> statement-breakpoint
CREATE INDEX "script_assemblies_script_active_idx" ON "script_assemblies" ("scriptId", "isActive", "createdAt" DESC);
