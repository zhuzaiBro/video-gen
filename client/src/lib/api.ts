import { getAccessToken } from "./supabase";
import type { ArtboardLayer } from "./artboard-types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      message = data.detail ?? data.message ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
};

export type AppUser = {
  id: number;
  supabaseId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  lastSignedIn: string;
};

export type ReferenceImage = {
  id: number;
  personaId: number;
  imageKey: string;
  imageUrl: string;
  shotType?: PhotoShotType | string;
  expression?: PhotoExpression | string;
  faceCropKey?: string | null;
  faceCropUrl?: string | null;
  bodyCropKey?: string | null;
  bodyCropUrl?: string | null;
  uploadedAt: string;
};

export type PhotoShotType = "front_face" | "side_face" | "body" | "other";
export type PhotoExpression = "neutral" | "slight_smile" | "calm" | "focused";
export type PersonaExpressionTone =
  | "subtle_natural"
  | "subtle_smile"
  | "calm_serious"
  | "focused_talk";

export type PersonaImagePresign = {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
  expiresIn: number;
};

export type Persona = {
  id: number;
  userId: number;
  name: string;
  description?: string | null;
  personality?: string | null;
  voiceStyle?: string | null;
  voiceTone?: string | null;
  voiceSampleUrl?: string | null;
  voiceSampleDescription?: string | null;
  voiceSampleKlingId?: string | null;
  backgroundStory?: string | null;
  selfIntroduction?: string | null;
  douyinProfileUrl?: string | null;
  expressionTone?: PersonaExpressionTone | string | null;
  expressionNotes?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  referenceImageKey?: string | null;
  referenceImageUrl?: string | null;
  referenceImages?: ReferenceImage[];
  createdAt: string;
  updatedAt: string;
};

export type GeneratedVideo = {
  id: number;
  taskId: number;
  userId: number;
  videoKey: string;
  videoUrl: string;
  duration?: number | null;
  resolution?: string | null;
  aspectRatio?: string | null;
  fileSize?: number | null;
  title?: string | null;
  description?: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type KlingSettings = {
  accessKey: string;
  hasSecretKey: boolean;
  secretKeyMasked?: string | null;
  apiBaseUrl: string;
  modelName: string;
  defaultMode: string;
  configured: boolean;
  configuredVia: string;
};

export type VideoScript = {
  id: number;
  userId: number;
  personaId?: number | null;
  sourceUrl: string;
  platform?: string | null;
  title?: string | null;
  rawTranscript?: string | null;
  decomposedScript?: Record<string, unknown> | null;
  summary?: string | null;
  status: "pending" | "processing" | "completed" | "failed" | string;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  continuityEnabled?: boolean;
  bottomBarrageEnabled?: boolean;
  scriptDurationSec?: number | null;
  recommendedDurationSec?: number | null;
  maxKlingDurationSec?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TechTopicSource = {
  title: string;
  url: string;
  snippet: string;
};

export type TechTopic = {
  id: string;
  title: string;
  summary: string;
  heat: string;
  keywords: string[];
  angles: string[];
  sources: TechTopicSource[];
};

export type TechTopicSearchResult = {
  searchRecordId?: number | null;
  topics: TechTopic[];
};

export type TechTopicSearchRecord = {
  id: number;
  query?: string | null;
  topicCount: number;
  topics: TechTopic[];
  createdAt: string;
};

export type PreparedFrameReview = {
  passed?: boolean;
  score?: number;
  issues?: string[];
  summary?: string;
  fixSuggestions?: string[];
};

export type ScriptSegment = {
  index: number;
  startSec: number;
  endSec: number;
  spokenText?: string | null;
  visualDescription?: string | null;
  purpose?: string | null;
  klingDurationSec: number;
  naturalDurationSec?: number | null;
  taskId?: number | null;
  taskStatus?: string | null;
  videoUrl?: string | null;
  userPrompt?: string | null;
  expandedPrompt?: string | null;
  referenceImageUrls?: string[] | null;
  generationParams?: {
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
    sound?: boolean;
    modelName?: string;
    continuity?: boolean;
    sceneCompose?: boolean;
    sceneComposeApplied?: boolean;
    sceneComposeWarning?: string | null;
    sceneFrameUrl?: string | null;
    preparedFrameUrl?: string | null;
    preparedFrameReview?: PreparedFrameReview | null;
    firstFrameMode?: "persona" | "prepared";
    personaImageIndex?: number;
    personaImageIndexes?: number[];
    personaImageRotations?: Record<string, number>;
  } | null;
  continuityFromSegment?: number | null;
  continuityFrameUrl?: string | null;
  artboardLayers?: ArtboardLayer[] | null;
  suggestedArtboardLayers?: ArtboardLayer[] | null;
};

export type SegmentPrepareFrameResult = {
  frameUrl: string;
  frameKey: string;
  reviewPassed: boolean;
  reviewScore: number;
  reviewIssues: string[];
  reviewSummary: string;
  reviewFixSuggestions?: string[];
  regenBackground?: string;
  regenCompose?: string;
  action: string;
  scene: string;
};

export type ScriptSegments = {
  scriptId: number;
  scriptDurationSec?: number | null;
  segments: ScriptSegment[];
  assemblyOrder?: number[];
  continuityEnabled?: boolean;
  bottomBarrageEnabled?: boolean;
  assembledVideoUrl?: string | null;
  allSegmentsReady: boolean;
  maxKlingDurationSec?: number;
  minKlingDurationSec?: number;
  pendingCount: number;
  processingCount: number;
};

export type ScriptAssembleResult = {
  scriptId: number;
  videoUrl: string;
  key: string;
  segmentCount: number;
};

export type ScriptGenerateAllResult = {
  createdCount: number;
  skippedCount: number;
  taskIds: number[];
};

export type VideoTask = {
  id: number;
  userId: number;
  personaId?: number | null;
  mode: string;
  prompt: string;
  expandedPrompt?: string | null;
  referenceImageKeys?: string[] | null;
  videoParams?: {
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
    scriptId?: number;
    segmentIndex?: number;
    continuity?: boolean;
    continuityFromSegment?: number;
    sceneCompose?: boolean;
    sceneComposeApplied?: boolean;
    sceneComposeWarning?: string;
    sceneFrameKey?: string;
  } | null;
  status: "pending" | "processing" | "completed" | "failed" | string;
  geminiOperationName?: string | null;
  generatedVideoKey?: string | null;
  generatedVideoUrl?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string;
};
