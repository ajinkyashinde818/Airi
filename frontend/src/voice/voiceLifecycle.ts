import { voiceManager } from "./voiceManager";

export function setupVoiceLifecycle(): () => void {
  const cleanup = () => {
    console.log("Airi: releasing microphone resources.");
    voiceManager.stop();
  };

  window.addEventListener("beforeunload", cleanup);

  return () => {
    window.removeEventListener("beforeunload", cleanup);
  };
}
