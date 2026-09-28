import { cameraManager } from "../camera/cameraManager";
import { AIRI_LIMITS } from "../config";
import { frameChangeDetector } from "./frameChangeDetector";
import { sendFrameToVision } from "./visionService";

export class VisionLoop {
  private running = false;
  private timer: number | null = null;
  private interval: number = AIRI_LIMITS.visionIntervalMs;
  private failureCount = 0;
  private processing = false;

  start(intervalMs?: number): void {
    if (intervalMs && intervalMs > 0) {
      this.interval = intervalMs;
    }

    if (this.running) {
      console.log("Airi Vision: continuous vision loop is already running.");
      return;
    }

    this.running = true;
    this.failureCount = 0;

    console.log(`Airi Vision: continuous vision started with ${this.interval}ms interval.`);

    this.scheduleNextCapture(0);
  }

  private scheduleNextCapture(delayMs: number): void {
    if (!this.running) {
      return;
    }

    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }

    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.captureAndAnalyze();
    }, delayMs);
  }

  private async captureAndAnalyze(): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.processing) {
      console.log("Airi Vision: previous analysis in progress. Skipping.");
      this.scheduleNextCapture(this.interval);
      return;
    }

    const frame = cameraManager.getFrameBase64();

    if (!frame) {
      console.warn("Airi Vision: camera frame unavailable.");
      this.scheduleNextCapture(this.interval);
      return;
    }

    const changed = await frameChangeDetector.hasChanged(frame);
    if (!changed) {
      this.scheduleNextCapture(this.interval);
      return;
    }

    this.processing = true;

    console.log("Airi Vision: analyzing changed frame...");

    try {
      const success = await sendFrameToVision(frame);

      if (success) {
        this.failureCount = 0;
        console.log("Airi Vision: frame processed.");
      } else {
        this.failureCount++;
        console.warn(`Airi Vision: analysis failed. Failure count: ${this.failureCount}`);
      }
    } catch (error) {
      this.failureCount++;
      console.error("Airi Vision: unexpected error:", error);
    } finally {
      this.processing = false;
    }

    if (!this.running) {
      return;
    }

    /*
     * If errors happen repeatedly, slow down temporarily.
     */
    const delay = this.failureCount >= 3 ? AIRI_LIMITS.visionFailureSlowdownMs : this.interval;
    this.scheduleNextCapture(delay);
  }

  stop(): void {
    this.running = false;
    this.processing = false;

    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    console.log("Airi Vision: continuous vision stopped.");
  }
}

export const visionLoop = new VisionLoop();
