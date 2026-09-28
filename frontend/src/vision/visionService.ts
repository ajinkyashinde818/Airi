import { AIRI_ENDPOINTS, AIRI_TIMEOUTS } from "../config";

export interface VisualPerson {
  count: number | null;
  position: string | null;
  visible: boolean | null;
}

export interface VisualScene {
  description: string | null;
  environment: string | null;
}

export interface VisualContext {
  scene: VisualScene;
  people: VisualPerson[];
  objects: string[];
  activities: string[];
  recent_changes: string[];
  last_updated: string | null;
  confidence: number | null;
}

interface VisionResponse {
  success?: boolean;
  description?: string;
  model?: string;
  visual_context?: VisualContext;
  detail?: unknown;
}

export async function sendFrameToVision(
  base64Image: string
): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    AIRI_TIMEOUTS.visionMs
  );

  try {
    const imageResponse = await fetch(base64Image);

    const blob = await imageResponse.blob();

    const formData = new FormData();

    formData.append("image", blob, "airi-frame.jpg");

    const response = await fetch(AIRI_ENDPOINTS.visionFrame, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    window.clearTimeout(timer);

    const data: VisionResponse = await response.json();

    if (!response.ok) {
      console.warn(
        "Vision API error:",
        response.status,
        data?.detail ?? data
      );

      return false;
    }

    console.log("Airi Vision:", data);

    return data.success === true;
  } catch (error) {
    window.clearTimeout(timer);

    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn("Airi Vision: analysis request timed out.");
      return false;
    }

    console.error("Airi Vision: network error:", error);

    return false;
  }
}
