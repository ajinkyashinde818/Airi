import { CameraService } from "./cameraService";

class CameraManager {
  private camera = new CameraService();
  private initializing: Promise<boolean> | null = null;

  async initialize(): Promise<boolean> {
    if (this.camera.isRunning()) {
      console.log("Airi Vision: camera already running.");
      return true;
    }

    if (this.initializing) {
      return this.initializing;
    }

    console.log("Airi Vision: initializing camera...");

    this.initializing = this.initializeInternal();

    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async initializeInternal(): Promise<boolean> {
    try {
      await this.camera.start();

      console.log(
        "Airi Vision: camera initialized successfully."
      );

      return true;
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        console.log(
          "Airi Vision: camera initialization was interrupted."
        );

        return false;
      }

      console.error(
        "Airi Vision: camera initialization failed:",
        error
      );

      return false;
    }
  }

  captureFrame(): string | null {
    return this.camera.captureFrameAsBase64();
  }

  stop(): void {
    this.camera.stop();
  }

  isRunning(): boolean {
    return this.camera.isRunning();
  }
}

export const cameraManager =
  new CameraManager();
