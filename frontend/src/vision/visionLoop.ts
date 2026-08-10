import { cameraManager } from "../camera/cameraManager";
import {
  frameChangeDetector,
} from "./frameChangeDetector";
import { sendFrameToVision } from "./visionService";

class VisionLoop {
  private timer: number | null = null;

  private running = false;

  private processing = false;

  private interval = 5000;

  private failureCount = 0;

  start(): void {
    if (this.running) {
      console.log(
        "Airi Vision: loop already running."
      );

      return;
    }

    this.running = true;

    this.failureCount = 0;

    console.log(
      "Airi Vision: continuous vision started."
    );

    this.scheduleNextCapture(0);
  }

  private scheduleNextCapture(
    delay: number
  ): void {
    if (!this.running) {
      return;
    }

    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }

    this.timer = window.setTimeout(
      () => {
        this.capture();
      },
      delay
    );
  }

  private async capture(): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.processing) {
      console.log(
        "Airi Vision: previous request still processing."
      );

      this.scheduleNextCapture(
        this.interval
      );

      return;
    }

    if (!cameraManager.isRunning()) {
      console.warn(
        "Airi Vision: camera is not running."
      );

      this.scheduleNextCapture(
        this.interval
      );

      return;
    }

    const frame =
      cameraManager.captureFrame();

    if (!frame) {
      console.warn(
        "Airi Vision: frame unavailable."
      );

      this.scheduleNextCapture(
        this.interval
      );

      return;
    }

    const changed =
      await frameChangeDetector
        .hasMeaningfulChange(frame);

    if (!changed) {
      console.log(
        "Airi Vision: no meaningful scene change. Skipping Gemini."
      );

      this.scheduleNextCapture(
        this.interval
      );

      return;
    }

    this.processing = true;

    console.log(
      "Airi Vision: analyzing changed frame..."
    );

    try {
      const success =
        await sendFrameToVision(frame);

      if (success) {
        this.failureCount = 0;

        console.log(
          "Airi Vision: frame processed."
        );
      } else {
        this.failureCount++;

        console.warn(
          `Airi Vision: analysis failed. ` +
          `Failure count: ${this.failureCount}`
        );
      }
    } catch (error) {
      this.failureCount++;

      console.error(
        "Airi Vision: unexpected error:",
        error
      );
    } finally {
      this.processing = false;

      if (!this.running) {
        return;
      }

      /*
       * If errors happen repeatedly, slow down temporarily.
       */
      const delay =
        this.failureCount >= 3
          ? 15000
          : this.interval;

      this.scheduleNextCapture(delay);
    }
  }

  stop(): void {
    this.running = false;

    this.processing = false;

    if (this.timer !== null) {
      window.clearTimeout(this.timer);

      this.timer = null;
    }

    console.log(
      "Airi Vision: continuous vision stopped."
    );
  }
}

export const visionLoop =
  new VisionLoop();
