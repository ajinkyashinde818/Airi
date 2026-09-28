import { AIRI_ENDPOINTS, AIRI_TIMEOUTS } from "../config";

export interface VisemeState {
  mouthOpen: number; // 0.0 to 1.0
  mouthWidth: number; // 0.5 to 1.5
  shape: "silence" | "A" | "E" | "I" | "O" | "U";
}

export type TtsStateListener = (speaking: boolean) => void;

export type TtsEngine = "browser" | "backend" | "none";

/**
 * Airi voice output.
 *
 * PRIMARY  : browser SpeechSynthesis (instant, offline, no round trip).
 * FALLBACK : backend Gemini TTS (/voice/tts) played through a single reused
 *            HTMLAudioElement, used when SpeechSynthesis is unavailable or
 *            fails to start.
 */
class TtsPlayer {
  private speaking = false;
  private listeners: Set<TtsStateListener> = new Set();
  private audio: HTMLAudioElement | null = null;
  private activeRunId = 0;
  private engine: TtsEngine = "none";

  public onStateChange(listener: TtsStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public isSpeaking(): boolean {
    return this.speaking;
  }

  public getEngine(): TtsEngine {
    return this.engine;
  }

  public supportsBrowserSpeech(): boolean {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof window.SpeechSynthesisUtterance === "function"
    );
  }

  public async playText(text: string, emotion: string = "neutral"): Promise<void> {
    this.stop(); // stop anything already playing (no overlapping speech)

    const cleaned = text.trim();
    if (!cleaned) return;

    const runId = ++this.activeRunId;

    if (this.supportsBrowserSpeech() && this.speakWithBrowser(cleaned, emotion, runId)) {
      return;
    }

    await this.speakWithBackend(cleaned, emotion, runId);
  }

  private speakWithBrowser(
    text: string,
    emotion: string,
    runId: number
  ): boolean {
    try {
      window.speechSynthesis.cancel(); // Clear queue

      const utterance = new SpeechSynthesisUtterance(text);

      // Adjust voice pitch/rate based on emotion
      switch (emotion) {
        case "excited":
        case "happy":
          utterance.pitch = 1.2;
          utterance.rate = 1.1;
          break;
        case "sad":
          utterance.pitch = 0.8;
          utterance.rate = 0.85;
          break;
        case "surprised":
          utterance.pitch = 1.3;
          utterance.rate = 1.05;
          break;
        case "thinking":
        case "calm":
          utterance.pitch = 0.95;
          utterance.rate = 0.95;
          break;
        default:
          utterance.pitch = 1.0;
          utterance.rate = 1.0;
          break;
      }

      utterance.onend = () => {
        if (runId === this.activeRunId) {
          this.setSpeaking(false);
        }
      };

      utterance.onerror = (event) => {
        if (runId !== this.activeRunId) {
          return; // Cancelled by a newer utterance (barge-in).
        }

        console.warn(
          "Airi TTS: browser speech error:",
          (event as SpeechSynthesisErrorEvent).error
        );
        this.setSpeaking(false);
      };

      this.engine = "browser";
      this.setSpeaking(true);
      window.speechSynthesis.speak(utterance);

      return true;
    } catch (error) {
      console.warn("Airi TTS: browser speech failed:", error);
      this.setSpeaking(false);
      return false;
    }
  }

  private async speakWithBackend(
    text: string,
    emotion: string,
    runId: number
  ): Promise<void> {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      AIRI_TIMEOUTS.ttsMs
    );

    try {
      const response = await fetch(AIRI_ENDPOINTS.tts, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, emotion }),
        signal: controller.signal,
      });

      window.clearTimeout(timer);

      if (!response.ok) {
        console.warn(`Airi TTS: backend TTS HTTP error ${response.status}`);
        return;
      }

      const data = (await response.json()) as {
        success?: boolean;
        audio_base64?: string | null;
        mime_type?: string;
      };

      if (!data.success || !data.audio_base64) {
        console.warn("Airi TTS: backend returned no audio.");
        return;
      }

      if (runId !== this.activeRunId) {
        return; // A newer utterance already started.
      }

      this.engine = "backend";

      await this.playBackendAudio(data.audio_base64, data.mime_type, runId);
    } catch (error) {
      window.clearTimeout(timer);

      if (error instanceof DOMException && error.name === "AbortError") {
        console.warn("Airi TTS: backend TTS timed out.");
        return;
      }

      console.warn("Airi TTS: backend TTS failed:", error);
    }
  }

  private playBackendAudio(
    base64Audio: string,
    mimeType: string | undefined,
    runId: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const audio = this.ensureAudio();

      audio.onended = () => {
        if (runId === this.activeRunId) {
          this.setSpeaking(false);
        }
        resolve();
      };

      audio.onerror = () => {
        console.warn("Airi TTS: audio playback error.");
        if (runId === this.activeRunId) {
          this.setSpeaking(false);
        }
        resolve();
      };

      audio.src = `data:${mimeType || "audio/wav"};base64,${base64Audio}`;

      this.setSpeaking(true);

      // Airi is always started by a user gesture (mic/camera enable), so
      // autoplay restrictions rarely apply; handled gracefully if they do.
      audio.play().catch((error) => {
        console.warn("Airi TTS: autoplay blocked:", error);
        this.setSpeaking(false);
        resolve();
      });
    });
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = "auto";
    }

    return this.audio;
  }

  public stop(): void {
    this.activeRunId += 1;

    if (this.supportsBrowserSpeech()) {
      window.speechSynthesis.cancel();
    }

    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }

    if (this.speaking) {
      console.log("Airi TTS: stopping playback (barge-in / interruption).");
      this.setSpeaking(false);
    }
  }

  /** Release all audio resources (component unmount / page unload). */
  public dispose(): void {
    this.stop();
    this.audio = null;
    this.listeners.clear();
  }

  public getVisemeData(): VisemeState {
    if (!this.speaking) {
      return { mouthOpen: 0, mouthWidth: 1.0, shape: "silence" };
    }

    // Procedural lip movement oscillation while speaking
    const now = performance.now() / 1000;
    const openMod = Math.abs(Math.sin(now * 12)) * 0.7 + Math.abs(Math.cos(now * 7)) * 0.3;
    const widthMod = 0.8 + Math.sin(now * 8) * 0.3;

    const shapes: VisemeState["shape"][] = ["A", "E", "O", "I"];
    const shapeIndex = Math.floor((now * 8) % 4);
    const shape = shapes[shapeIndex];

    return {
      mouthOpen: Math.max(0.1, Math.min(openMod, 1.0)),
      mouthWidth: Math.max(0.6, Math.min(widthMod, 1.3)),
      shape,
    };
  }

  private setSpeaking(state: boolean): void {
    if (this.speaking !== state) {
      this.speaking = state;

      if (!state) {
        this.engine = "none";
      }

      this.listeners.forEach((fn) => fn(state));
    }
  }
}

export const ttsPlayer = new TtsPlayer();
