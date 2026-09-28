import { MicrophoneService } from "./microphoneService";
import { VoiceActivityDetector } from "./voiceActivityDetector";
import { speechToTextService } from "./speechToTextService";
import { brainService } from "../brain/brainService";
import { ttsPlayer } from "./ttsPlayer";
import { airiStateMachine } from "../state/airiStateMachine";
import type { VadConfig, VadState, VoiceEvents, TranscriptResult } from "./types";

/** Assistant reply emitted after the Airi Brain answers a user utterance. */
export interface BrainResponseEvent {
  userText: string;
  responseText: string;
  emotion: string;
  shouldSpeak: boolean;
}

class VoiceManager {
  private mic = new MicrophoneService();
  private vad: VoiceActivityDetector | null = null;
  private initializing: Promise<boolean> | null = null;
  private listeners: VoiceEvents = {};
  private cancelled = false;

  public onSpeechStart(cb: () => void): () => void {
    const prev = this.listeners.onSpeechStart;
    this.listeners.onSpeechStart = () => {
      if (prev) prev();
      cb();
    };
    return () => {
      this.listeners.onSpeechStart = prev;
    };
  }

  public onSpeechEnd(cb: (buffer: Float32Array[]) => void): () => void {
    const prev = this.listeners.onSpeechEnd;
    this.listeners.onSpeechEnd = (buf) => {
      if (prev) prev(buf);
      cb(buf);
    };
    return () => {
      this.listeners.onSpeechEnd = prev;
    };
  }

  public onTranscript(cb: (result: TranscriptResult) => void): () => void {
    const prev = this.listeners.onTranscript;
    this.listeners.onTranscript = (result) => {
      if (prev) prev(result);
      cb(result);
    };
    return () => {
      this.listeners.onTranscript = prev;
    };
  }

  /**
   * Fired once the Airi Brain produced an assistant reply. This is what keeps
   * the React UI in sync with the brain response text and emotion.
   */
  public onBrainResponse(cb: (event: BrainResponseEvent) => void): () => void {
    const prev = this.listeners.onBrainResponse;
    this.listeners.onBrainResponse = (event) => {
      if (prev) prev(event);
      cb(event);
    };
    return () => {
      this.listeners.onBrainResponse = prev;
    };
  }

  public onVoiceStateChange(cb: (state: VadState) => void): () => void {
    const prev = this.listeners.onVoiceStateChange;
    this.listeners.onVoiceStateChange = (state) => {
      if (prev) prev(state);
      cb(state);
    };
    return () => {
      this.listeners.onVoiceStateChange = prev;
    };
  }

  public onError(cb: (error: Error) => void): () => void {
    const prev = this.listeners.onError;
    this.listeners.onError = (err) => {
      if (prev) prev(err);
      cb(err);
    };
    return () => {
      this.listeners.onError = prev;
    };
  }

  async initialize(): Promise<boolean> {
    if (this.mic.isRunning()) {
      return true;
    }

    if (this.initializing) {
      return this.initializing;
    }

    this.cancelled = false;

    this.initializing = this.initializeInternal();
    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async initializeInternal(): Promise<boolean> {
    try {
      await this.mic.start();
      console.log("Airi Voice: microphone ready");
      return true;
    } catch (error) {
      console.warn("Airi Voice: microphone initialization failed:", error);
      return false;
    }
  }

  startVAD(config?: Partial<VadConfig>): boolean {
    const stream = this.mic.getStream();
    if (!stream || !this.mic.isRunning()) {
      console.warn("Airi Voice: cannot start VAD, microphone is not running.");
      return false;
    }

    this.cancelled = false;

    const audioTrack = stream.getAudioTracks()[0];
    const settings = audioTrack ? audioTrack.getSettings() : {};
    const sampleRate = settings.sampleRate || 44100;

    const events: VoiceEvents = {
      onSpeechStart: () => {
        console.log("Airi Voice: speech started");
        // Barge-in: Stop TTS playback immediately if Airi was speaking!
        if (ttsPlayer.isSpeaking()) {
          ttsPlayer.stop();
          airiStateMachine.setState("INTERRUPTED", "Barge-in: speech interrupted TTS playback.");
        } else {
          airiStateMachine.setState("LISTENING", "User is speaking...");
        }

        if (this.listeners.onSpeechStart) {
          this.listeners.onSpeechStart();
        }
      },

      onSpeechEnd: (buffer) => {
        console.log("Airi Voice: speech ended");
        airiStateMachine.setState("THINKING", "Transcribing speech...");

        if (this.listeners.onSpeechEnd) {
          this.listeners.onSpeechEnd(buffer);
        }

        void this.processUtterance(buffer, sampleRate);
      },

      onVoiceStateChange: (state) => {
        if (this.listeners.onVoiceStateChange) {
          this.listeners.onVoiceStateChange(state);
        }
      },

      onError: (err) => {
        console.error("Airi Voice: VAD error:", err);
        if (this.listeners.onError) {
          this.listeners.onError(err);
        }
      },
    };

    if (this.vad) {
      this.vad.stop();
    }

    this.vad = new VoiceActivityDetector(events, config);
    this.vad.start(stream);

    return true;
  }

  /**
   * Full utterance pipeline: STT -> Brain -> (optional) TTS.
   *
   * Failures are reported through the state machine and the error listener so
   * the UI can show a graceful message instead of crashing.
   */
  private async processUtterance(
    buffer: Float32Array[],
    sampleRate: number
  ): Promise<void> {
    if (this.cancelled) {
      return;
    }

    try {
      const result = await speechToTextService.transcribeAudio(buffer, sampleRate);

      if (this.cancelled) {
        return;
      }

      if (!result.success) {
        this.reportGracefulFailure(
          "Sorry, I couldn't transcribe that. Please try again.",
          result.error
        );
        return;
      }

      const transcript = result.text.trim();

      if (!transcript) {
        console.log("Airi Voice: no speech recognized.");
        airiStateMachine.setState("IDLE", "Listening for your voice...");
        return;
      }

      console.log(`Airi Voice: transcript: "${transcript}"`);

      if (this.listeners.onTranscript) {
        this.listeners.onTranscript(result);
      }

      airiStateMachine.setState("THINKING", "Airi is thinking...");

      const brainRes = await brainService.sendToBrain(transcript);

      if (this.cancelled) {
        return;
      }

      if (!brainRes.success || !brainRes.response) {
        if (brainRes.error === "request_in_progress") {
          airiStateMachine.setState("IDLE");
          return;
        }

        this.reportGracefulFailure(
          "Sorry, I couldn't connect to my AI service right now.",
          brainRes.error
        );
        return;
      }

      const { text, emotion, should_speak } = brainRes.response;

      if (this.listeners.onBrainResponse) {
        this.listeners.onBrainResponse({
          userText: transcript,
          responseText: text,
          emotion,
          shouldSpeak: should_speak,
        });
      }

      if (!should_speak || !text) {
        airiStateMachine.setState("IDLE", "Listening for your voice...");
        return;
      }

      airiStateMachine.setState("SPEAKING", "Airi is responding...");

      await ttsPlayer.playText(text, emotion);

      if (this.cancelled) {
        return;
      }

      if (airiStateMachine.getState() === "SPEAKING") {
        airiStateMachine.setState("IDLE", "Listening for your voice...");
      }
    } catch (error) {
      if (this.cancelled) {
        return;
      }

      console.error("Airi Voice: utterance pipeline error:", error);
      this.reportGracefulFailure(
        "Something went wrong while processing your request.",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private reportGracefulFailure(userMessage: string, detail?: string): void {
    console.warn("Airi Voice: failure:", userMessage, detail ?? "");

    airiStateMachine.setState("ERROR", userMessage);

    if (this.listeners.onError) {
      this.listeners.onError(new Error(userMessage));
    }

    // Return to a usable listening state shortly after reporting the error.
    window.setTimeout(() => {
      if (!this.cancelled && airiStateMachine.getState() === "ERROR") {
        airiStateMachine.setState("IDLE", "Listening for your voice...");
      }
    }, 3000);
  }

  stop(): void {
    if (this.vad) {
      this.vad.stop();
      this.vad = null;
    }
    this.mic.stop();
  }

  /** Permanently releases microphone + VAD resources (component unmount). */
  dispose(): void {
    this.cancelled = true;
    this.stop();
  }

  isRunning(): boolean {
    return this.mic.isRunning();
  }

  getVadState(): VadState {
    return this.vad ? this.vad.getState() : "IDLE";
  }
}

export const voiceManager = new VoiceManager();
