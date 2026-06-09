import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { deleteFileFromCos } from "../storage-cos";
import { TRPCError } from "@trpc/server";

/**
 * Video History Router
 */
export const historyRouter = router({
  /**
   * Get generated videos for current user
   */
  listVideos: protectedProcedure
    .input(
      z.object({
        personaId: z.number().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        if (input.personaId) {
          return await db.getGeneratedVideosByPersonaId(
            ctx.user.id,
            input.personaId,
            input.limit,
            input.offset
          );
        }

        return await db.getGeneratedVideosByUserId(
          ctx.user.id,
          input.limit,
          input.offset
        );
      } catch (error) {
        console.error("[History] List videos failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch videos",
        });
      }
    }),

  /**
   * Toggle favorite status of a video
   */
  toggleFavorite: protectedProcedure
    .input(z.object({ videoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        // TODO: Verify ownership
        const video = await db.updateGeneratedVideo(input.videoId, {
          isFavorite: true, // Toggle logic would need current state
        });

        return video;
      } catch (error) {
        console.error("[History] Toggle favorite failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update video",
        });
      }
    }),

  /**
   * Update video metadata (title, description)
   */
  updateMetadata: protectedProcedure
    .input(
      z.object({
        videoId: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // TODO: Verify ownership
        const video = await db.updateGeneratedVideo(input.videoId, {
          title: input.title,
          description: input.description,
        });

        return video;
      } catch (error) {
        console.error("[History] Update metadata failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update video",
        });
      }
    }),

  /**
   * Delete generated video
   */
  deleteVideo: protectedProcedure
    .input(z.object({ videoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        // TODO: Verify ownership and delete from COS
        await db.deleteGeneratedVideo(input.videoId);

        return { success: true };
      } catch (error) {
        console.error("[History] Delete video failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete video",
        });
      }
    }),

  /**
   * Get video download URL
   */
  getDownloadUrl: protectedProcedure
    .input(z.object({ videoId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        // TODO: Verify ownership and generate signed URL
        return { url: "" };
      } catch (error) {
        console.error("[History] Get download URL failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate download URL",
        });
      }
    }),
});
