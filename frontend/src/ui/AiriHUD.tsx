import React, { useState, useEffect } from "react";
import { airiStateMachine } from "../state/airiStateMachine";
import type { AiriState } from "../state/airiStateMachine";
import { ttsPlayer } from "../voice/ttsPlayer";

export type StatusLevel = "connected" | "disabled" | "error" | "unknown" | "ready";

export interface SystemStatus {
  camera: StatusLevel;
  microphone: StatusLevel;
  ai: StatusLevel;
  voice: StatusLevel;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  emotion?: string;
  timestamp: number;
}

interface AiriHUDProps {
  cameraReady: boolean;
  micReady: boolean;
  currentTranscript: string;
  airiResponseText: string;
  currentEmotion: string;
  conversation?: ConversationTurn[];
  systemStatus?: SystemStatus;
  errorMessage?: string | null;
  onDismissError?: () => void;
  onToggleMic?: () => void;
  onToggleCamera?: () => void;
  onResetSession?: () => void;
}

const STATUS_LABEL: Record<StatusLevel, string> = {
  connected: "Connected",
  disabled: "Disabled",
  error: "Error",
  ready: "Ready",
  unknown: "Checking",
};

export const AiriHUD: React.FC<AiriHUDProps> = ({
  cameraReady,
  micReady,
  currentTranscript,
  airiResponseText,
  currentEmotion,
  conversation = [],
  systemStatus,
  errorMessage,
  onDismissError,
  onToggleMic,
  onToggleCamera,
  onResetSession,
}) => {
  const [airiState, setAiriState] = useState<AiriState>(airiStateMachine.getState());
  const [statusMessage, setStatusMessage] = useState<string>(airiStateMachine.getStatusMessage());

  useEffect(() => {
    const unsubscribe = airiStateMachine.subscribe((newState) => {
      setAiriState(newState);
      setStatusMessage(airiStateMachine.getStatusMessage());
    });
    return () => unsubscribe();
  }, []);

  const handleInterrupt = () => {
    ttsPlayer.stop();
    airiStateMachine.setState("INTERRUPTED", "Speech interrupted by user.");
  };

  const getStateColor = (state: AiriState) => {
    switch (state) {
      case "INITIALIZING":
        return "#f59e0b"; // Amber
      case "IDLE":
        return "#10b981"; // Emerald green
      case "LISTENING":
        return "#06b6d4"; // Cyan
      case "THINKING":
        return "#8b5cf6"; // Purple
      case "SPEAKING":
        return "#ec4899"; // Pink
      case "INTERRUPTED":
        return "#f97316"; // Orange
      case "ERROR":
        return "#ef4444"; // Red
    }
  };

  return (
    <div className="airi-hud-overlay">
      {/* Top Header Status Bar */}
      <div className="airi-hud-header">
        <div className="airi-brand">
          <span className="airi-dot" style={{ backgroundColor: getStateColor(airiState) }} />
          <span className="airi-title">AIRI</span>
          <span className="airi-version">v1.0 REAL-TIME</span>
        </div>

        <div className="airi-status-pills">
          <span className={`hud-pill ${cameraReady ? "active" : "inactive"}`}>
            📷 Camera: {cameraReady ? "ON" : "OFF"}
          </span>
          <span className={`hud-pill ${micReady ? "active" : "inactive"}`}>
            🎤 Mic: {micReady ? "ON" : "OFF"}
          </span>
          <span className="hud-pill state-pill" style={{ borderColor: getStateColor(airiState), color: getStateColor(airiState) }}>
            {airiState}
          </span>
        </div>
      </div>

      {/* System status + error indicator */}
      <div className="airi-system-status">
        <StatusRow label="Camera" level={systemStatus?.camera ?? (cameraReady ? "connected" : "disabled")} />
        <StatusRow label="Microphone" level={systemStatus?.microphone ?? (micReady ? "connected" : "disabled")} />
        <StatusRow label="AI" level={systemStatus?.ai ?? "unknown"} />
        <StatusRow label="Voice" level={systemStatus?.voice ?? "unknown"} />
        <span className={`status-lamp ${airiState === "LISTENING" ? "listening" : ""}`} title="Listening indicator">
          {airiState === "LISTENING" ? "● Listening" : airiState === "SPEAKING" ? "● Speaking" : airiState === "THINKING" ? "● Thinking" : "● Idle"}
        </span>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="airi-error-banner" role="alert">
          <span className="error-icon">⚠</span>
          <span className="error-text">{errorMessage}</span>
          {onDismissError && (
            <button className="error-dismiss" onClick={onDismissError} title="Dismiss">
              ✕
            </button>
          )}
        </div>
      )}

      {/* Center Subtitle / Status Toast */}
      <div className="airi-status-toast">
        <span className="status-msg">{statusMessage}</span>
        {currentEmotion && currentEmotion !== "neutral" && (
          <span className="emotion-tag">Mood: {currentEmotion}</span>
        )}
      </div>

      {/* Transcript & Response Overlay */}
      {(currentTranscript || airiResponseText || conversation.length > 0) && (
        <div className="airi-conversation-box">
          {conversation.length > 0 && (
            <div className="airi-conversation-history">
              {conversation.map((turn) => (
                <div
                  key={`${turn.role}-${turn.timestamp}`}
                  className={`chat-bubble ${turn.role === "user" ? "user-bubble" : "airi-bubble"}`}
                >
                  <span className="bubble-label">
                    {turn.role === "user" ? "You" : "AIRI"}
                  </span>
                  <p className="bubble-text">{turn.text}</p>
                  {turn.role === "assistant" && turn.emotion && turn.emotion !== "neutral" && (
                    <span className="emotion-tag">Mood: {turn.emotion}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {currentTranscript && conversation.length === 0 && (
            <div className="chat-bubble user-bubble">
              <span className="bubble-label">You</span>
              <p className="bubble-text">{currentTranscript}</p>
            </div>
          )}

          {airiResponseText && conversation.length === 0 && (
            <div className="chat-bubble airi-bubble">
              <span className="bubble-label">AIRI</span>
              <p className="bubble-text">{airiResponseText}</p>
            </div>
          )}
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      <div className="airi-hud-controls">
        <button
          className="hud-btn"
          onClick={onToggleMic}
          title="Toggle Microphone"
        >
          {micReady ? "🎙️ Mute Mic" : "🎙️ Unmute Mic"}
        </button>

        <button
          className="hud-btn"
          onClick={onToggleCamera}
          title="Toggle Camera"
        >
          {cameraReady ? "🎥 Stop Camera" : "🎥 Start Camera"}
        </button>

        {airiState === "SPEAKING" && (
          <button
            className="hud-btn interrupt-btn"
            onClick={handleInterrupt}
            title="Interrupt Airi"
          >
            ⏹️ Interrupt
          </button>
        )}

        <button
          className="hud-btn reset-btn"
          onClick={onResetSession}
          title="Reset Conversation"
        >
          🔄 Reset
        </button>
      </div>
    </div>
  );
};

interface StatusRowProps {
  label: string;
  level: StatusLevel;
}

const StatusRow: React.FC<StatusRowProps> = ({ label, level }) => (
  <span className={`status-row status-${level}`}>
    <span className="status-lamp-dot">●</span>
    {label}: {STATUS_LABEL[level]}
  </span>
);
