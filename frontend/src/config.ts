/**
 * Central frontend configuration.
 *
 * Every backend URL is derived from a single environment variable so no
 * endpoint is hardcoded inside feature modules.
 */

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function readApiBaseUrl(): string {
  const raw =
    (import.meta.env.VITE_AIRI_API_BASE_URL as string | undefined) ??
    DEFAULT_API_BASE_URL;

  return raw.replace(/\/+$/, "");
}

export const API_BASE_URL = readApiBaseUrl();

export const AIRI_ENDPOINTS = {
  health: `${API_BASE_URL}/health`,
  brain: `${API_BASE_URL}/brain/respond`,
  transcribe: `${API_BASE_URL}/voice/transcribe`,
  tts: `${API_BASE_URL}/voice/tts`,
  visionFrame: `${API_BASE_URL}/vision/frame`,
  visionContext: `${API_BASE_URL}/vision/context`,
  sessionReset: `${API_BASE_URL}/session/reset`,
  sessionContext: `${API_BASE_URL}/session/context`,
  memory: `${API_BASE_URL}/memory`,
} as const;

export const AIRI_TIMEOUTS = {
  brainMs: 15000,
  transcribeMs: 15000,
  visionMs: 20000,
  ttsMs: 15000,
  healthMs: 4000,
} as const;

export const AIRI_LIMITS = {
  maxConversationTurns: 8,
  visionIntervalMs: 3000,
  visionFailureSlowdownMs: 15000,
} as const;
