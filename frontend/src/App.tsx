import { useCallback, useEffect, useRef, useState } from "react";
import { cameraManager } from "./camera/cameraManager";
import { setupCameraLifecycle } from "./camera/cameraLifecycle";
import { visionLoop } from "./vision/visionLoop";
import { voiceManager } from "./voice/voiceManager";
import type { BrainResponseEvent } from "./voice/voiceManager";
import { setupVoiceLifecycle } from "./voice/voiceLifecycle";
import { ttsPlayer } from "./voice/ttsPlayer";
import { brainService } from "./brain/brainService";
import { airiStateMachine } from "./state/airiStateMachine";
import { AiriAvatarCanvas } from "./avatar/AiriAvatarCanvas";
import { AiriHUD } from "./ui/AiriHUD";
import type { ConversationTurn, SystemStatus } from "./ui/AiriHUD";
import { AIRI_ENDPOINTS, AIRI_LIMITS, AIRI_TIMEOUTS } from "./config";
import "./App.css";

const DEFAULT_SYSTEM_STATUS: SystemStatus = {
  camera: "unknown",
  microphone: "unknown",
  ai: "unknown",
  voice: "unknown",
};

/**
 * Checks whether the Airi backend (and therefore the AI service) is reachable.
 */
async function probeAiStatus(): Promise<SystemStatus["ai"]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), AIRI_TIMEOUTS.healthMs);

  try {
    const response = await fetch(AIRI_ENDPOINTS.health, { signal: controller.signal });
    window.clearTimeout(timer);

    if (!response.ok) {
      return "error";
    }

    const data = (await response.json()) as {
      status?: string;
      gemini_configured?: boolean;
    };

    return data.status === "healthy" && data.gemini_configured
      ? "connected"
      : "error";
  } catch {
    window.clearTimeout(timer);
    return "error";
  }
}

function App() {

  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [airiResponseText, setAiriResponseText] = useState("");
  const [currentEmotion, setCurrentEmotion] = useState("neutral");
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] =
    useState<SystemStatus>(DEFAULT_SYSTEM_STATUS);

  const systemStatusRef = useRef(systemStatus);
  systemStatusRef.current = systemStatus;

  const pushTurn = useCallback((turn: ConversationTurn) => {
    setConversation((prev) => [...prev, turn].slice(-AIRI_LIMITS.maxConversationTurns));
  }, []);

  const handleBrainResponse = useCallback(
    (event: BrainResponseEvent) => {
      if (event.responseText) {
        setAiriResponseText(event.responseText);
        setCurrentEmotion(event.emotion || "neutral");
        pushTurn({
          role: "assistant",
          text: event.responseText,
          emotion: event.emotion,
          timestamp: Date.now(),
        });
      }

      setSystemStatus((prev) => ({ ...prev, ai: "connected" }));
      setErrorMessage(null);
    },
    [pushTurn]
  );

  useEffect(() => {
    let cancelled = false;

    airiStateMachine.setState("INITIALIZING", "Starting camera, mic & AI engine...");

    const removeCameraLifecycle = setupCameraLifecycle();
    const removeVoiceLifecycle = setupVoiceLifecycle();

    const removeTranscriptListener = voiceManager.onTranscript((result) => {
      if (result.text) {
        setCurrentTranscript(result.text);
        pushTurn({ role: "user", text: result.text, timestamp: Date.now() });
      }
    });

    const removeBrainListener = voiceManager.onBrainResponse(handleBrainResponse);

    const removeErrorListener = voiceManager.onError((error) => {
      setErrorMessage(error.message);
    });

    const removeTtsListener = ttsPlayer.onStateChange(() => {
      setSystemStatus((prev) => ({
        ...prev,
        voice: ttsPlayer.supportsBrowserSpeech() ? "ready" : "error",
      }));
    });

    const initializeAiri = async () => {
      console.log("Airi: starting system initialization...");

      const aiStatus = await probeAiStatus();
      if (cancelled) return;

      setSystemStatus((prev) => ({
        ...prev,
        ai: aiStatus,
        voice: ttsPlayer.supportsBrowserSpeech() ? "ready" : "error",
      }));

      if (aiStatus === "error") {
        setErrorMessage(
          "Airi's AI service is unreachable. Start the backend and reload."
        );
      }

      // 1. Initialize Camera & Vision
      const camOk = await cameraManager.initialize();
      if (cancelled) return;

      if (camOk) {
        setCameraReady(true);
        setSystemStatus((prev) => ({ ...prev, camera: "connected" }));
        visionLoop.start();
        console.log("Airi: camera & vision system active.");
      } else {
        console.warn("Airi: camera unavailable.");
        setSystemStatus((prev) => ({ ...prev, camera: "disabled" }));
        setErrorMessage("Camera unavailable. Airi will run as a voice assistant.");
      }

      // 2. Initialize Microphone & VAD
      const micOk = await voiceManager.initialize();
      if (cancelled) return;

      if (micOk) {
        setMicReady(true);
        setSystemStatus((prev) => ({ ...prev, microphone: "connected" }));
        voiceManager.startVAD();
        console.log("Airi: voice activity detection active.");
      } else {
        console.warn("Airi: microphone unavailable.");
        setSystemStatus((prev) => ({ ...prev, microphone: "disabled" }));
        setErrorMessage(
          "Microphone unavailable. Allow microphone access, then reload the page."
        );
      }

      airiStateMachine.setState("IDLE", "Listening for your voice...");
    };

    initializeAiri();

    return () => {
      cancelled = true;
      removeCameraLifecycle();
      removeVoiceLifecycle();
      removeTranscriptListener();
      removeBrainListener();
      removeErrorListener();
      removeTtsListener();
      visionLoop.stop();
      cameraManager.stop();
      voiceManager.dispose();
      ttsPlayer.dispose();
      console.log("Airi: React component cleanup.");
    };
  }, [handleBrainResponse, pushTurn]);

  const handleToggleMic = async () => {
    if (micReady) {
      voiceManager.stop();
      setMicReady(false);
      setSystemStatus((prev) => ({ ...prev, microphone: "disabled" }));
      airiStateMachine.setState("IDLE", "Microphone muted.");
      return;
    }

    const ok = await voiceManager.initialize();

    if (ok) {
      setMicReady(true);
      setSystemStatus((prev) => ({ ...prev, microphone: "connected" }));
      voiceManager.startVAD();
      setErrorMessage(null);
      airiStateMachine.setState("IDLE", "Listening for your voice...");
    } else {
      setSystemStatus((prev) => ({ ...prev, microphone: "disabled" }));
      setErrorMessage("Could not access the microphone.");
    }
  };

  const handleToggleCamera = async () => {
    if (cameraReady) {
      visionLoop.stop();
      cameraManager.stop();
      setCameraReady(false);
      setSystemStatus((prev) => ({ ...prev, camera: "disabled" }));
      return;
    }

    const ok = await cameraManager.initialize();

    if (ok) {
      setCameraReady(true);
      setSystemStatus((prev) => ({ ...prev, camera: "connected" }));
      visionLoop.start();
      setErrorMessage(null);
    } else {
      setSystemStatus((prev) => ({ ...prev, camera: "disabled" }));
      setErrorMessage("Could not access the camera.");
    }
  };

  const handleResetSession = async () => {
    ttsPlayer.stop();
    setCurrentTranscript("");
    setAiriResponseText("");
    setCurrentEmotion("neutral");
    setConversation([]);
    setErrorMessage(null);
    airiStateMachine.setState("IDLE", "Session reset. Listening for your voice...");

    const ok = await brainService.resetSession();

    if (!ok) {
      setErrorMessage("Could not reset the conversation on the server.");
    }
  };

  return (
    <main className="airi-screen">
      {/* Visual Avatar Canvas */}
      <div className="airi-avatar-viewport">
        <AiriAvatarCanvas emotion={currentEmotion} width={480} height={480} />
      </div>

      {/* Head-Up Display Overlay */}
      <AiriHUD
        cameraReady={cameraReady}
        micReady={micReady}
        currentTranscript={currentTranscript}
        airiResponseText={airiResponseText}
        currentEmotion={currentEmotion}
        conversation={conversation}
        systemStatus={systemStatus}
        errorMessage={errorMessage}
        onDismissError={() => setErrorMessage(null)}
        onToggleMic={handleToggleMic}
        onToggleCamera={handleToggleCamera}
        onResetSession={handleResetSession}
      />
    </main>
  );
}

export default App;
