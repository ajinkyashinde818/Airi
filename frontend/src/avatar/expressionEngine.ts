export type FacialEmotion =
  | "neutral"
  | "happy"
  | "sad"
  | "excited"
  | "curious"
  | "confused"
  | "concerned"
  | "calm"
  | "surprised";

export interface FaceParameters {
  eyebrowAngle: number;
  eyebrowHeight: number;
  eyeScaleY: number;
  blushOpacity: number;
  glowColor: string;
  glowIntensity: number;
}

export class ExpressionEngine {
  private currentEmotion: FacialEmotion = "neutral";
  private targetParams: FaceParameters;
  private currentParams: FaceParameters;

  constructor() {
    this.targetParams = this.getParamsForEmotion("neutral");
    this.currentParams = { ...this.targetParams };
  }

  public setEmotion(emotion: string): void {
    const validEmotion = this.normalizeEmotion(emotion);
    if (this.currentEmotion !== validEmotion) {
      this.currentEmotion = validEmotion;
      this.targetParams = this.getParamsForEmotion(validEmotion);
    }
  }

  public getEmotion(): FacialEmotion {
    return this.currentEmotion;
  }

  public update(deltaTime: number): FaceParameters {
    // Smooth lerp parameters towards target
    const speed = Math.min(deltaTime * 8, 0.25);
    this.currentParams.eyebrowAngle += (this.targetParams.eyebrowAngle - this.currentParams.eyebrowAngle) * speed;
    this.currentParams.eyebrowHeight += (this.targetParams.eyebrowHeight - this.currentParams.eyebrowHeight) * speed;
    this.currentParams.eyeScaleY += (this.targetParams.eyeScaleY - this.currentParams.eyeScaleY) * speed;
    this.currentParams.blushOpacity += (this.targetParams.blushOpacity - this.currentParams.blushOpacity) * speed;
    this.currentParams.glowIntensity += (this.targetParams.glowIntensity - this.currentParams.glowIntensity) * speed;
    this.currentParams.glowColor = this.targetParams.glowColor;

    return this.currentParams;
  }

  private normalizeEmotion(emotion: string): FacialEmotion {
    const e = emotion ? emotion.toLowerCase() : "neutral";
    switch (e) {
      case "happy":
      case "excited":
      case "sad":
      case "curious":
      case "confused":
      case "concerned":
      case "calm":
      case "surprised":
        return e as FacialEmotion;
      default:
        return "neutral";
    }
  }

  private getParamsForEmotion(emotion: FacialEmotion): FaceParameters {
    switch (emotion) {
      case "happy":
        return {
          eyebrowAngle: 5,
          eyebrowHeight: 4,
          eyeScaleY: 1.0,
          blushOpacity: 0.6,
          glowColor: "#38bdf8", // Cyan blue
          glowIntensity: 0.9,
        };
      case "excited":
        return {
          eyebrowAngle: 8,
          eyebrowHeight: 6,
          eyeScaleY: 1.15,
          blushOpacity: 0.7,
          glowColor: "#818cf8", // Violet
          glowIntensity: 1.0,
        };
      case "curious":
        return {
          eyebrowAngle: -6,
          eyebrowHeight: 3,
          eyeScaleY: 1.1,
          blushOpacity: 0.3,
          glowColor: "#38bdf8",
          glowIntensity: 0.8,
        };
      case "confused":
        return {
          eyebrowAngle: -10,
          eyebrowHeight: -2,
          eyeScaleY: 0.9,
          blushOpacity: 0.2,
          glowColor: "#f59e0b", // Amber
          glowIntensity: 0.7,
        };
      case "sad":
        return {
          eyebrowAngle: -8,
          eyebrowHeight: -5,
          eyeScaleY: 0.75,
          blushOpacity: 0.1,
          glowColor: "#64748b", // Slate
          glowIntensity: 0.5,
        };
      case "surprised":
        return {
          eyebrowAngle: 12,
          eyebrowHeight: 8,
          eyeScaleY: 1.25,
          blushOpacity: 0.4,
          glowColor: "#ec4899", // Pink
          glowIntensity: 1.0,
        };
      default:
        return {
          eyebrowAngle: 0,
          eyebrowHeight: 0,
          eyeScaleY: 1.0,
          blushOpacity: 0.3,
          glowColor: "#38bdf8",
          glowIntensity: 0.7,
        };
    }
  }
}

export const expressionEngine = new ExpressionEngine();
