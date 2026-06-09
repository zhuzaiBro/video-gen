import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users, personas, referenceImages, videoGenerationTasks, generatedVideos, Persona, VideoGenerationTask, GeneratedVideo, InsertVideoGenerationTask, InsertGeneratedVideo } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _client: postgres.Sql | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL);
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _client = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.openId, user.openId))
      .limit(1);

    if (existingUser.length > 0) {
      // Update existing user
      const updateData: Partial<InsertUser> = {
        lastSignedIn: new Date(),
      };

      if (user.name !== undefined) updateData.name = user.name;
      if (user.email !== undefined) updateData.email = user.email;
      if (user.loginMethod !== undefined) updateData.loginMethod = user.loginMethod;
      if (user.role !== undefined) updateData.role = user.role;

      await db
        .update(users)
        .set(updateData)
        .where(eq(users.openId, user.openId));
    } else {
      // Insert new user
      const newUser: InsertUser = {
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        role: user.openId === ENV.ownerOpenId ? 'admin' : (user.role || 'user'),
        lastSignedIn: new Date(),
      };

      await db.insert(users).values(newUser);
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ Persona Management ============

export async function createPersona(userId: number, data: Omit<Persona, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { name: string }): Promise<Persona> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .insert(personas)
    .values({
      userId,
      name: data.name,
      description: data.description,
      personality: data.personality,
      voiceStyle: data.voiceStyle,
      backgroundStory: data.backgroundStory,
      referenceImageKey: data.referenceImageKey,
      referenceImageUrl: data.referenceImageUrl,
    })
    .returning();

  return result[0];
}

export async function getPersonasByUserId(userId: number): Promise<Persona[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(personas).where(eq(personas.userId, userId));
}

export async function getPersonaById(personaId: number): Promise<Persona | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(personas).where(eq(personas.id, personaId)).limit(1);
  return result[0];
}

export async function updatePersona(personaId: number, data: Partial<Omit<Persona, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<Persona> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(personas)
    .set(data)
    .where(eq(personas.id, personaId))
    .returning();

  return result[0];
}

export async function deletePersona(personaId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(personas).where(eq(personas.id, personaId));
}

// ============ Reference Images ============

export async function addReferenceImage(personaId: number, imageKey: string, imageUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .insert(referenceImages)
    .values({ personaId, imageKey, imageUrl })
    .returning();

  return result[0];
}

export async function getReferenceImagesByPersonaId(personaId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(referenceImages).where(eq(referenceImages.personaId, personaId));
}

export async function deleteReferenceImage(imageId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(referenceImages).where(eq(referenceImages.id, imageId));
}

// ============ Video Generation Tasks ============

export async function createVideoGenerationTask(data: Omit<InsertVideoGenerationTask, 'createdAt' | 'updatedAt'>): Promise<VideoGenerationTask> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .insert(videoGenerationTasks)
    .values(data as any)
    .returning();

  return result[0];
}

export async function getVideoGenerationTaskById(taskId: number): Promise<VideoGenerationTask | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(videoGenerationTasks)
    .where(eq(videoGenerationTasks.id, taskId))
    .limit(1);

  return result[0];
}

export async function getVideoGenerationTasksByUserId(userId: number, limit = 50, offset = 0): Promise<VideoGenerationTask[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(videoGenerationTasks)
    .where(eq(videoGenerationTasks.userId, userId))
    .orderBy((t) => t.createdAt)
    .limit(limit)
    .offset(offset);
}

export async function updateVideoGenerationTask(taskId: number, data: Partial<Omit<VideoGenerationTask, 'id' | 'userId' | 'createdAt'>>): Promise<VideoGenerationTask> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(videoGenerationTasks)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(videoGenerationTasks.id, taskId))
    .returning();

  return result[0];
}

// ============ Generated Videos ============

export async function createGeneratedVideo(data: Omit<InsertGeneratedVideo, 'createdAt' | 'updatedAt'>): Promise<GeneratedVideo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .insert(generatedVideos)
    .values(data as any)
    .returning();

  return result[0];
}

export async function getGeneratedVideosByUserId(userId: number, limit = 50, offset = 0): Promise<GeneratedVideo[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(generatedVideos)
    .where(eq(generatedVideos.userId, userId))
    .orderBy((v) => v.createdAt)
    .limit(limit)
    .offset(offset);
}

export async function getGeneratedVideosByPersonaId(userId: number, personaId: number, limit = 50, offset = 0): Promise<GeneratedVideo[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(generatedVideos)
    .innerJoin(videoGenerationTasks, eq(generatedVideos.taskId, videoGenerationTasks.id))
    .where(and(eq(generatedVideos.userId, userId), eq(videoGenerationTasks.personaId, personaId)))
    .limit(limit)
    .offset(offset)
    .then((rows) => rows.map((row) => row.generated_videos));
}

export async function updateGeneratedVideo(videoId: number, data: Partial<Omit<GeneratedVideo, 'id' | 'taskId' | 'userId' | 'createdAt'>>): Promise<GeneratedVideo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(generatedVideos)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(generatedVideos.id, videoId))
    .returning();

  return result[0];
}

export async function deleteGeneratedVideo(videoId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(generatedVideos).where(eq(generatedVideos.id, videoId));
}

// TODO: add feature queries here as your schema grows.
