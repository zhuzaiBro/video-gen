import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";

/**
 * Gemini Video Generation Configuration
 */
export interface VideoGenerationConfig {
  prompt: string;
  referenceImages?: Array<{ url: string; mimeType?: string }>;
  duration?: number; // 8 seconds default
  resolution?: "720p" | "1080p" | "4K"; // 720p default
  aspectRatio?: "16:9" | "9:16"; // 16:9 default
}

/**
 * Gemini Video Generation Response
 */
export interface VideoGenerationResponse {
  operationName: string;
  done: boolean;
  response?: {
    generatedVideos?: Array<{
      video?: {
        uri?: string;
      };
    }>;
  };
}

/**
 * Generate video using Gemini Veo 3.1 API
 * This is a placeholder implementation - actual API calls would use the Gemini SDK
 */
export async function generateVideoWithVeo(
  config: VideoGenerationConfig
): Promise<{ operationName: string }> {
  if (!ENV.geminiApiKey) {
    throw new Error("Gemini API key not configured");
  }

  // TODO: Implement actual Gemini Veo 3.1 API call
  // For now, return a mock operation name
  const operationName = `projects/*/locations/*/operations/${Date.now()}-${Math.random().toString(36).substring(7)}`;

  console.log("[Gemini] Video generation initiated:", {
    operationName,
    prompt: config.prompt,
    hasReferenceImages: !!config.referenceImages?.length,
  });

  return { operationName };
}

/**
 * Check video generation operation status
 */
export async function checkVideoGenerationStatus(
  operationName: string
): Promise<VideoGenerationResponse> {
  if (!ENV.geminiApiKey) {
    throw new Error("Gemini API key not configured");
  }

  // TODO: Implement actual Gemini API call to check operation status
  // For now, return a mock response
  return {
    operationName,
    done: false,
    response: undefined,
  };
}

/**
 * Use LLM to expand persona description into a detailed video prompt
 */
export async function expandPersonaToPrompt(
  personaName: string,
  personaDescription: string,
  personalityTraits: string,
  voiceStyle: string,
  backgroundStory: string,
  userPrompt?: string
): Promise<string> {
  const systemPrompt = `You are a creative director specializing in digital human video generation. 
Your task is to expand a persona description into a detailed, vivid video generation prompt that captures the character's essence.
The prompt should be specific, cinematic, and suitable for AI video generation models.
Keep the prompt concise but descriptive (150-300 words).`;

  const userMessage = `
Create a detailed video generation prompt for this digital persona:

**Name:** ${personaName}
**Appearance:** ${personaDescription}
**Personality:** ${personalityTraits}
**Voice:** ${voiceStyle}
**Background:** ${backgroundStory}

${userPrompt ? `**Additional Direction:** ${userPrompt}` : ""}

Generate a prompt that brings this character to life in a video. Focus on their unique characteristics, mannerisms, and presence.
The prompt should guide an AI video model to create authentic, engaging footage of this character.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Failed to expand persona to prompt");
  }

  return content;
}

/**
 * Generate video in "persona agent" mode
 * 1. Expand persona to detailed prompt using LLM
 * 2. Call Gemini Veo 3.1 to generate video
 */
export async function generateVideoFromPersona(
  personaName: string,
  personaDescription: string,
  personalityTraits: string,
  voiceStyle: string,
  backgroundStory: string,
  referenceImageUrls?: string[],
  userPrompt?: string,
  config?: Omit<VideoGenerationConfig, "prompt" | "referenceImages">
): Promise<{ operationName: string; expandedPrompt: string }> {
  // Step 1: Expand persona to detailed prompt
  const expandedPrompt = await expandPersonaToPrompt(
    personaName,
    personaDescription,
    personalityTraits,
    voiceStyle,
    backgroundStory,
    userPrompt
  );

  console.log("[Gemini] Expanded persona prompt:", expandedPrompt);

  // Step 2: Generate video with expanded prompt
  const referenceImages = referenceImageUrls?.map((url) => ({
    url,
    mimeType: "image/jpeg",
  }));

  const videoConfig: VideoGenerationConfig = {
    prompt: expandedPrompt,
    referenceImages,
    ...config,
  };

  const result = await generateVideoWithVeo(videoConfig);

  return {
    operationName: result.operationName,
    expandedPrompt,
  };
}
