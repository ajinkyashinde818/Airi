import { ttsPlayer } from "../voice/ttsPlayer";
import type { VisemeState } from "../voice/ttsPlayer";

export interface MouthState {
  openRatio: number; // 0.0 (closed) to 1.0 (wide open)
  widthRatio: number; // 0.6 to 1.4
  shape: string;
}

export class LipSyncEngine {
  private currentOpen = 0;
  private currentWidth = 1.0;

  public update(deltaTime: number): MouthState {
    const rawViseme: VisemeState = ttsPlayer.getVisemeData();

    // Lerp mouth opening and width for continuous organic movement
    const speed = Math.min(deltaTime * 15, 0.4);
    this.currentOpen += (rawViseme.mouthOpen - this.currentOpen) * speed;
    this.currentWidth += (rawViseme.mouthWidth - this.currentWidth) * speed;

    return {
      openRatio: this.currentOpen,
      widthRatio: this.currentWidth,
      shape: rawViseme.shape,
    };
  }
}

export const lipSyncEngine = new LipSyncEngine();
