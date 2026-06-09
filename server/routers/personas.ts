import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { uploadReferenceImage, uploadGeneratedVideo } from "../storage-cos";
import { generateVideoFromPersona, generateVideoWithVeo } from "../gemini-video";
import { TRPCError } from "@trpc/server";

/**
 * Persona Management Router
 */
export const personasRouter = router({
  /**
   * Create a new digital persona
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Persona name is required"),
        description: z.string().optional(),
        personality: z.string().optional(),
        voiceStyle: z.string().optional(),
        backgroundStory: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const persona = await db.createPersona(ctx.user.id, {
          name: input.name,
          description: input.description || null,
          personality: input.personality || null,
          voiceStyle: input.voiceStyle || null,
          backgroundStory: input.backgroundStory || null,
        } as any);

        return persona;
      } catch (error) {
        console.error("[Personas] Create failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create persona",
        });
      }
    }),

  /**
   * Get all personas for current user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await db.getPersonasByUserId(ctx.user.id);
    } catch (error) {
      console.error("[Personas] List failed:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch personas",
      });
    }
  }),

  /**
   * Get persona by ID
   */
  getById: protectedProcedure
    .input(z.object({ personaId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const persona = await db.getPersonaById(input.personaId);

        if (!persona || persona.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Persona not found",
          });
        }

        // Get reference images for this persona
        const referenceImages = await db.getReferenceImagesByPersonaId(
          input.personaId
        );

        return { ...persona, referenceImages };
      } catch (error) {
        console.error("[Personas] GetById failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch persona",
        });
      }
    }),

  /**
   * Update persona
   */
  update: protectedProcedure
    .input(
      z.object({
        personaId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        personality: z.string().optional(),
        voiceStyle: z.string().optional(),
        backgroundStory: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const persona = await db.getPersonaById(input.personaId);

        if (!persona || persona.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Persona not found",
          });
        }

        const updated = await db.updatePersona(input.personaId, {
          name: input.name ?? persona.name,
          description: input.description ?? persona.description,
          personality: input.personality ?? persona.personality,
          voiceStyle: input.voiceStyle ?? persona.voiceStyle,
          backgroundStory: input.backgroundStory ?? persona.backgroundStory,
        } as any);

        return updated;
      } catch (error) {
        console.error("[Personas] Update failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update persona",
        });
      }
    }),

  /**
   * Delete persona
   */
  delete: protectedProcedure
    .input(z.object({ personaId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const persona = await db.getPersonaById(input.personaId);

        if (!persona || persona.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Persona not found",
          });
        }

        await db.deletePersona(input.personaId);

        return { success: true };
      } catch (error) {
        console.error("[Personas] Delete failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete persona",
        });
      }
    }),

  /**
   * Upload reference image for persona
   */
  uploadReferenceImage: protectedProcedure
    .input(
      z.object({
        personaId: z.number(),
        imageBuffer: z.instanceof(Buffer),
        filename: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const persona = await db.getPersonaById(input.personaId);

        if (!persona || persona.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Persona not found",
          });
        }

        const { key, url } = await uploadReferenceImage(
          input.personaId,
          input.imageBuffer,
          input.filename
        );

        const referenceImage = await db.addReferenceImage(
          input.personaId,
          key,
          url
        );

        return referenceImage;
      } catch (error) {
        console.error("[Personas] Upload reference image failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload reference image",
        });
      }
    }),

  /**
   * Delete reference image
   */
  deleteReferenceImage: protectedProcedure
    .input(z.object({ imageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        // TODO: Verify ownership by checking persona ownership
        await db.deleteReferenceImage(input.imageId);

        return { success: true };
      } catch (error) {
        console.error("[Personas] Delete reference image failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete reference image",
        });
      }
    }),
});
