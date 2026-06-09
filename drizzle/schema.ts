import { integer, pgEnum, pgTable, text, timestamp, varchar, serial, boolean, json } from "drizzle-orm/pg-core";

// Enum for user roles
export const roleEnum = pgEnum("role", ["user", "admin"]);

// Enum for video generation task status
export const taskStatusEnum = pgEnum("task_status", ["pending", "processing", "completed", "failed"]);

// Enum for video generation mode
export const generationModeEnum = pgEnum("generation_mode", ["prompt", "reference_image", "persona_agent"]);

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Digital persona table - stores character profiles for video generation
 */
export const personas = pgTable("personas", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"), // Physical appearance description
  personality: text("personality"), // Character traits and personality
  voiceStyle: varchar("voiceStyle", { length: 255 }), // Voice characteristics
  backgroundStory: text("backgroundStory"), // Character background
  referenceImageKey: varchar("referenceImageKey", { length: 512 }), // COS storage key for main reference image
  referenceImageUrl: varchar("referenceImageUrl", { length: 1024 }), // Accessible URL for reference image
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Persona = typeof personas.$inferSelect;
export type InsertPersona = typeof personas.$inferInsert;

/**
 * Reference images table - stores multiple reference images per persona
 */
export const referenceImages = pgTable("reference_images", {
  id: serial("id").primaryKey(),
  personaId: integer("personaId").notNull().references(() => personas.id, { onDelete: "cascade" }),
  imageKey: varchar("imageKey", { length: 512 }).notNull(), // COS storage key
  imageUrl: varchar("imageUrl", { length: 1024 }).notNull(), // Accessible URL
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});

export type ReferenceImage = typeof referenceImages.$inferSelect;
export type InsertReferenceImage = typeof referenceImages.$inferInsert;

/**
 * Video generation tasks table - tracks all video generation requests
 */
export const videoGenerationTasks = pgTable("video_generation_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  personaId: integer("personaId").references(() => personas.id, { onDelete: "set null" }), // Null for non-persona modes
  mode: generationModeEnum("mode").notNull(), // prompt, reference_image, or persona_agent
  prompt: text("prompt").notNull(),
  expandedPrompt: text("expandedPrompt"), // LLM-expanded prompt for persona_agent mode
  referenceImageKeys: json("referenceImageKeys"), // Array of COS keys for reference images
  videoParams: json("videoParams"), // Duration, resolution, aspect ratio, etc.
  status: taskStatusEnum("status").default("pending").notNull(),
  geminiOperationName: varchar("geminiOperationName", { length: 512 }), // Long-running operation ID from Gemini API
  generatedVideoKey: varchar("generatedVideoKey", { length: 512 }), // COS storage key for generated video
  generatedVideoUrl: varchar("generatedVideoUrl", { length: 1024 }), // Accessible URL for generated video
  errorMessage: text("errorMessage"), // Error details if generation failed
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type VideoGenerationTask = typeof videoGenerationTasks.$inferSelect;
export type InsertVideoGenerationTask = typeof videoGenerationTasks.$inferInsert;

/**
 * Generated videos table - stores metadata about successfully generated videos
 */
export const generatedVideos = pgTable("generated_videos", {
  id: serial("id").primaryKey(),
  taskId: integer("taskId").notNull().references(() => videoGenerationTasks.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  videoKey: varchar("videoKey", { length: 512 }).notNull(), // COS storage key
  videoUrl: varchar("videoUrl", { length: 1024 }).notNull(), // Accessible URL
  duration: integer("duration"), // Video duration in seconds
  resolution: varchar("resolution", { length: 50 }), // 720p, 1080p, 4K
  aspectRatio: varchar("aspectRatio", { length: 10 }), // 16:9 or 9:16
  fileSize: integer("fileSize"), // File size in bytes
  title: varchar("title", { length: 255 }), // User-friendly title
  description: text("description"), // Optional description
  isFavorite: boolean("isFavorite").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type GeneratedVideo = typeof generatedVideos.$inferSelect;
export type InsertGeneratedVideo = typeof generatedVideos.$inferInsert;