import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { generateVideoWithVeo, generateVideoFromPersona } from "../gemini-video";
import { TRPCError } from "@trpc/server";

/**
 * Video Generation Router
 */
export const videoGenerationRouter = router({
  /**
   * Generate video from prompt only
   */
  generateFromPrompt: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(10, "Prompt must be at least 10 characters"),
        duration: z.number().optional(),
        resolution: z.enum(["720p", "1080p", "4K"]).optional(),
        aspectRatio: z.enum(["16:9", "9:16"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Create task record
        const task = await db.createVideoGenerationTask({
          userId: ctx.user.id,
          mode: "prompt",
          prompt: input.prompt,
          videoParams: {
            duration: input.duration || 8,
            resolution: input.resolution || "720p",
            aspectRatio: input.aspectRatio || "16:9",
          },
        } as any);

        // Call Gemini API
        const { operationName } = await generateVideoWithVeo({
          prompt: input.prompt,
          duration: input.duration,
          resolution: input.resolution as any,
          aspectRatio: input.aspectRatio as any,
        });

        // Update task with operation name
        const updatedTask = await db.updateVideoGenerationTask(task.id, {
          geminiOperationName: operationName,
          status: "processing",
          startedAt: new Date(),
        });

        return updatedTask;
      } catch (error) {
        console.error("[VideoGeneration] Generate from prompt failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate video",
        });
      }
    }),

  /**
   * Generate video from reference images
   */
  generateFromReferenceImages: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(10, "Prompt must be at least 10 characters"),
        referenceImageUrls: z.array(z.string().url()).min(1).max(3),
        duration: z.number().optional(),
        resolution: z.enum(["720p", "1080p", "4K"]).optional(),
        aspectRatio: z.enum(["16:9", "9:16"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Create task record
        const task = await db.createVideoGenerationTask({
          userId: ctx.user.id,
          mode: "reference_image",
          prompt: input.prompt,
          referenceImageKeys: input.referenceImageUrls,
          videoParams: {
            duration: input.duration || 8,
            resolution: input.resolution || "720p",
            aspectRatio: input.aspectRatio || "16:9",
          },
        } as any);

        // Call Gemini API with reference images
        const { operationName } = await generateVideoWithVeo({
          prompt: input.prompt,
          referenceImages: input.referenceImageUrls.map((url) => ({
            url,
            mimeType: "image/jpeg",
          })),
          duration: input.duration,
          resolution: input.resolution as any,
          aspectRatio: input.aspectRatio as any,
        });

        // Update task with operation name
        const updatedTask = await db.updateVideoGenerationTask(task.id, {
          geminiOperationName: operationName,
          status: "processing",
          startedAt: new Date(),
        });

        return updatedTask;
      } catch (error) {
        console.error(
          "[VideoGeneration] Generate from reference images failed:",
          error
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate video",
        });
      }
    }),

  /**
   * Generate video from persona (Agent mode)
   */
  generateFromPersona: protectedProcedure
    .input(
      z.object({
        personaId: z.number(),
        userPrompt: z.string().optional(),
        duration: z.number().optional(),
        resolution: z.enum(["720p", "1080p", "4K"]).optional(),
        aspectRatio: z.enum(["16:9", "9:16"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Get persona
        const persona = await db.getPersonaById(input.personaId);

        if (!persona || persona.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Persona not found",
          });
        }

        // Get reference images for persona
        const referenceImages = await db.getReferenceImagesByPersonaId(
          input.personaId
        );

        // Generate video from persona using LLM + Veo
        const { operationName, expandedPrompt } = await generateVideoFromPersona(
          persona.name,
          persona.description || "",
          persona.personality || "",
          persona.voiceStyle || "",
          persona.backgroundStory || "",
          referenceImages.map((img) => img.imageUrl),
          input.userPrompt,
          {
            duration: input.duration,
            resolution: input.resolution as any,
            aspectRatio: input.aspectRatio as any,
          }
        );

        // Create task record
        const task = await db.createVideoGenerationTask({
          userId: ctx.user.id,
          personaId: input.personaId,
          mode: "persona_agent",
          prompt: input.userPrompt || "",
          expandedPrompt,
          referenceImageKeys: referenceImages.map((img) => img.imageKey),
          videoParams: {
            duration: input.duration || 8,
            resolution: input.resolution || "720p",
            aspectRatio: input.aspectRatio || "16:9",
          },
          geminiOperationName: operationName,
          status: "processing",
          startedAt: new Date(),
        } as any);

        return task;
      } catch (error) {
        console.error("[VideoGeneration] Generate from persona failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate video",
        });
      }
    }),

  /**
   * Get video generation task by ID
   */
  getTask: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const task = await db.getVideoGenerationTaskById(input.taskId);

        if (!task || task.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Task not found",
          });
        }

        return task;
      } catch (error) {
        console.error("[VideoGeneration] Get task failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch task",
        });
      }
    }),

  /**
   * List video generation tasks for current user
   */
  listTasks: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await db.getVideoGenerationTasksByUserId(
          ctx.user.id,
          input.limit,
          input.offset
        );
      } catch (error) {
        console.error("[VideoGeneration] List tasks failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch tasks",
        });
      }
    }),

  /**
   * Cancel video generation task
   */
  cancelTask: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const task = await db.getVideoGenerationTaskById(input.taskId);

        if (!task || task.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Task not found",
          });
        }

        if (task.status === "completed" || task.status === "failed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot cancel completed or failed task",
          });
        }

        const updated = await db.updateVideoGenerationTask(input.taskId, {
          status: "failed",
          errorMessage: "Cancelled by user",
          completedAt: new Date(),
        });

        return updated;
      } catch (error) {
        console.error("[VideoGeneration] Cancel task failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cancel task",
        });
      }
    }),
});
