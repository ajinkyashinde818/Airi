import {
  DEFAULT_VAD_CONFIG,
} from "./types";
import type {
  VadConfig,
  VadState,
  VoiceEvents,
} from "./types";

export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  private state: VadState = "IDLE";
  private config: VadConfig;
  private events: VoiceEvents;

  private speechStartTime: number | null = null;
  private silenceStartTime: number | null = null;
  private audioBuffer: Float32Array[] = [];
  private active = false;

  constructor(events: VoiceEvents = {}, config: Partial<VadConfig> = {}) {
    this.events = events;
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
  }

  public start(stream: MediaStream): void {
    if (this.active) {
      this.stop();
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioCtx) {
        throw new Error("Web Audio API is not supported in this browser.");
      }

      this.audioContext = new AudioCtx();
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.analyserNode = this.audioContext.createAnalyser();

      this.analyserNode.fftSize = this.config.fftSize;
      this.analyserNode.smoothingTimeConstant =
        this.config.smoothingTimeConstant;

      this.sourceNode.connect(this.analyserNode);

      this.setState("IDLE");
      this.active = true;
      this.audioBuffer = [];

      this.processLoop();
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error(String(error));
      if (this.events.onError) {
        this.events.onError(err);
      } else {
        console.error("Airi Voice: VAD start failed:", err);
      }
    }
  }

  private processLoop = (): void => {
    if (!this.active || !this.analyserNode) {
      return;
    }

    const dataArray = new Float32Array(this.analyserNode.fftSize);
    this.analyserNode.getFloatTimeDomainData(dataArray);

    const rms = this.calculateRms(dataArray);
    const now = performance.now();

    this.evaluateState(rms, now, dataArray);

    if (this.active) {
      this.animFrameId = requestAnimationFrame(this.processLoop);
    }
  };

  public calculateRms(data: Float32Array): number {
    if (data.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }

  public evaluateState(rms: number, now: number, data: Float32Array): void {
    switch (this.state) {
      case "IDLE":
        if (rms >= this.config.startThreshold) {
          this.speechStartTime = now;
          this.setState("VOICE_DETECTED");
        }
        break;

      case "VOICE_DETECTED":
        if (rms < this.config.startThreshold) {
          // False alarm / noise spike: return to IDLE
          this.speechStartTime = null;
          this.setState("IDLE");
        } else if (
          this.speechStartTime !== null &&
          now - this.speechStartTime >= this.config.minimumSpeechDurationMs
        ) {
          // Sustained speech confirmed
          this.setState("SPEAKING");
          this.audioBuffer = [new Float32Array(data)];
          if (this.events.onSpeechStart) {
            this.events.onSpeechStart();
          }
        }
        break;

      case "SPEAKING":
        this.audioBuffer.push(new Float32Array(data));

        if (rms < this.config.endThreshold) {
          this.silenceStartTime = now;
          this.setState("SILENCE_DETECTED");
        }
        break;

      case "SILENCE_DETECTED":
        this.audioBuffer.push(new Float32Array(data));

        if (rms >= this.config.startThreshold) {
          // User resumed speaking within silence window
          this.silenceStartTime = null;
          this.setState("SPEAKING");
        } else if (
          this.silenceStartTime !== null &&
          now - this.silenceStartTime >= this.config.silenceDurationMs
        ) {
          // Speech ended
          const completedBuffer = [...this.audioBuffer];
          this.setState("ENDING");
          if (this.events.onSpeechEnd) {
            this.events.onSpeechEnd(completedBuffer);
          }
          this.audioBuffer = [];
          this.speechStartTime = null;
          this.silenceStartTime = null;
          this.setState("IDLE");
        }
        break;

      case "ENDING":
        // Transient state before IDLE
        this.setState("IDLE");
        break;
    }
  }

  private setState(newState: VadState): void {
    if (this.state !== newState) {
      this.state = newState;
      if (this.events.onVoiceStateChange) {
        this.events.onVoiceStateChange(newState);
      }
    }
  }

  public getState(): VadState {
    return this.state;
  }

  public stop(): void {
    this.active = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.audioContext) {
      if (this.audioContext.state !== "closed") {
        this.audioContext.close().catch(() => null);
      }
      this.audioContext = null;
    }

    this.audioBuffer = [];
    this.speechStartTime = null;
    this.silenceStartTime = null;
    this.setState("IDLE");
  }
}
