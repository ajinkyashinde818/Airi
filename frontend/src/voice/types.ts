export type VadState =
  | "IDLE"
  | "VOICE_DETECTED"
  | "SPEAKING"
  | "SILENCE_DETECTED"
  | "ENDING";

export interface VadConfig {
  /** RMS threshold to switch from IDLE to VOICE_DETECTED */
  startThreshold: number;

  /** Lower RMS threshold below which audio is considered silence (hysteresis) */
  endThreshold: number;

  /** Minimum duration (ms) audio must remain above startThreshold to trigger speechStart */
  minimumSpeechDurationMs: number;

  /** Silence duration (ms) required to trigger speechEnd */
  silenceDurationMs: number;

  /** AnalyserNode FFT size */
  fftSize: number;

  /** AnalyserNode smoothingTimeConstant */
  smoothingTimeConstant: number;
}

export interface TranscriptResult {
  success: boolean;
  text: string;
  language?: string;
  confidence?: number;
  durationMs?: number;
  error?: string;
}

export interface VoiceEvents {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audioBuffer: Float32Array[]) => void;
  onTranscript?: (result: TranscriptResult) => void;
  onBrainResponse?: (event: {
    userText: string;
    responseText: string;
    emotion: string;
    shouldSpeak: boolean;
  }) => void;
  onVoiceStateChange?: (state: VadState) => void;
  onError?: (error: Error) => void;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  startThreshold: 0.035,
  endThreshold: 0.015,
  minimumSpeechDurationMs: 200,
  silenceDurationMs: 750,
  fftSize: 512,
  smoothingTimeConstant: 0.8,
};
