import { encodeFloat32ToWav } from "./audioEncoder";
import { AIRI_ENDPOINTS, AIRI_TIMEOUTS } from "../config";
import type { TranscriptResult } from "./types";

export class SpeechToTextService {
  private processing = false;

  async transcribeAudio(
    audioChunks: Float32Array[],
    sampleRate: number = 44100
  ): Promise<TranscriptResult> {
    if (this.processing) {
      console.log("Airi STT: previous transcription request still in progress. Skipping.");
      return {
        success: false,
        text: "",
        error: "request_in_progress",
      };
    }

    const encoded = encodeFloat32ToWav(audioChunks, sampleRate);

    if (!encoded) {
      console.log("Airi STT: audio buffer empty or too short. Skipping.");
      return {
        success: false,
        text: "",
        error: "audio_too_short",
      };
    }

    this.processing = true;
    console.log(`Airi STT: transcribing audio (${Math.round(encoded.durationMs)} ms)...`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AIRI_TIMEOUTS.transcribeMs);

    try {
      const formData = new FormData();
      formData.append("audio", encoded.blob, "airi-speech.wav");

      const response = await fetch(AIRI_ENDPOINTS.transcribe, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        console.warn(`Airi STT: HTTP error ${response.status}`);
        return {
          success: false,
          text: "",
          error: `http_${response.status}`,
        };
      }

      const data = (await response.json()) as {
        success?: boolean;
        text?: string;
        language?: string;
        error?: string;
      };

      const text = (data.text || "").trim();

      if (data.success === true && text) {
        console.log("Airi STT: transcript received:", text);
        return {
          success: true,
          text,
          language: data.language || "en",
          durationMs: encoded.durationMs,
        };
      }

      console.log("Airi STT: no speech text recognized.");
      return {
        success: true,
        text: "",
        language: data.language || "en",
        durationMs: encoded.durationMs,
      };
    } catch (error) {
      clearTimeout(timer);

      if (error instanceof DOMException && error.name === "AbortError") {
        console.warn("Airi STT: request timed out.");
        return {
          success: false,
          text: "",
          error: "timeout",
        };
      }

      console.error("Airi STT: network or server error:", error);
      return {
        success: false,
        text: "",
        error: error instanceof Error ? error.message : "unknown_error",
      };
    } finally {
      this.processing = false;
    }
  }
}

export const speechToTextService = new SpeechToTextService();
