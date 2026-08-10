import { cameraManager } from "./cameraManager";
import { visionLoop } from "../vision/visionLoop";

export function setupCameraLifecycle() {
  const cleanup = () => {
    console.log(
      "Airi: releasing camera resources."
    );

    visionLoop.stop();
    cameraManager.stop();
  };

  window.addEventListener(
    "beforeunload",
    cleanup
  );

  return () => {
    window.removeEventListener(
      "beforeunload",
      cleanup
    );
  };
}
