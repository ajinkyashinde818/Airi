import { AIRI_ENDPOINTS, AIRI_TIMEOUTS } from "../config";

export interface BrainResponseData {
  text: string;
  emotion: string;
  should_speak: boolean;
}

export interface BrainResult {
  success: boolean;
  response?: BrainResponseData;
  error?: string;
}

export class BrainService {
  private processing = false;
  private sessionResetInFlight = false;

  async sendToBrain(userText: string): Promise<BrainResult> {
    const text = userText.trim();

    if (!text) {
      return {
        success: false,
        error: "empty_text",
      };
    }

    if (this.processing) {
      console.log("Airi Brain: previous reasoning request still in progress. Skipping.");
      return {
        success: false,
        error: "request_in_progress",
      };
    }

    this.processing = true;
    console.log(`Airi Brain: sending transcript to Airi Brain: "${text}"`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AIRI_TIMEOUTS.brainMs);

    try {
      const response = await fetch(AIRI_ENDPOINTS.brain, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        console.warn(`Airi Brain: HTTP error ${response.status}`);
        return {
          success: false,
          error: `http_${response.status}`,
        };
      }

      const data = (await response.json()) as {
        success?: boolean;
        response?: BrainResponseData;
        error?: string;
      };

      if (data.success && data.response) {
        console.log(`Airi Brain: response received: "${data.response.text}"`);
        return {
          success: true,
          response: data.response,
        };
      }

      console.warn("Airi Brain: brain response returned failure status:", data);
      return {
        success: false,
        error: data.error || "brain_failed",
      };
    } catch (error) {
      clearTimeout(timer);

      if (error instanceof DOMException && error.name === "AbortError") {
        console.warn("Airi Brain: request timed out.");
        return {
          success: false,
          error: "timeout",
        };
      }

      console.error("Airi Brain: network or server error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "unknown_error",
      };
    } finally {
      this.processing = false;
    }
  }

  /**
   * Clears the backend conversation + short-term memory.
   * Permanent long-term memories are intentionally preserved.
   */
  async resetSession(): Promise<boolean> {
    if (this.sessionResetInFlight) {
      return false;
    }

    this.sessionResetInFlight = true;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AIRI_TIMEOUTS.brainMs);

    try {
      const response = await fetch(AIRI_ENDPOINTS.sessionReset, {
        method: "POST",
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        console.warn(`Airi Brain: session reset HTTP error ${response.status}`);
        return false;
      }

      const data = (await response.json()) as { success?: boolean };

      return data.success === true;
    } catch (error) {
      clearTimeout(timer);
      console.warn("Airi Brain: session reset failed:", error);
      return false;
    } finally {
      this.sessionResetInFlight = false;
    }
  }
}

export const brainService = new BrainService();
