import { useEffect } from "react";

import { cameraManager } from "./camera/cameraManager";
import { setupCameraLifecycle } from "./camera/cameraLifecycle";
import { visionLoop } from "./vision/visionLoop";

import "./App.css";

function App() {
  useEffect(() => {
    let cancelled = false;

    const removeLifecycle =
      setupCameraLifecycle();

    const initializeAiri = async () => {
      console.log(
        "Airi: starting initialization..."
      );

      const cameraReady =
        await cameraManager.initialize();

      if (cancelled) {
        console.log(
          "Airi: initialization cancelled."
        );
        return;
      }

      if (!cameraReady) {
        console.warn(
          "Airi: camera unavailable. Vision will not start."
        );
        return;
      }

      console.log(
        "Airi: camera ready."
      );

      visionLoop.start();

      console.log(
        "Airi: vision system started."
      );
    };

    initializeAiri();

    return () => {
      cancelled = true;

      removeLifecycle();

      console.log(
        "Airi: React component cleanup."
      );
    };
  }, []);

  return (
    <main className="airi-screen">
      <img
        src="/airi.png"
        alt=""
        className="airi-avatar"
      />
    </main>
  );
}

export default App;
