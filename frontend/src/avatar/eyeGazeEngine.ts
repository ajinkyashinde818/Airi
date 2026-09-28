export interface EyeGazeState {
  offsetX: number; // pupil offset X (-10 to 10)
  offsetY: number; // pupil offset Y (-10 to 10)
  blinkOpenness: number; // 0.0 (closed) to 1.0 (fully open)
}

export class EyeGazeEngine {
  private blinkTimer = 0;
  private blinkInterval = 3.5; // seconds
  private isBlinking = false;
  private blinkDuration = 0.15; // seconds
  private blinkProgress = 0;

  private gazeX = 0;
  private gazeY = 0;
  private targetGazeX = 0;
  private targetGazeY = 0;
  private gazeTimer = 0;

  public update(deltaTime: number): EyeGazeState {
    // 1. Blink handling
    this.blinkTimer += deltaTime;
    if (!this.isBlinking && this.blinkTimer >= this.blinkInterval) {
      this.isBlinking = true;
      this.blinkTimer = 0;
      this.blinkProgress = 0;
      // Randomize next blink interval (2.5s to 5.5s)
      this.blinkInterval = 2.5 + Math.random() * 3.0;
    }

    let blinkOpenness = 1.0;
    if (this.isBlinking) {
      this.blinkProgress += deltaTime;
      const norm = this.blinkProgress / this.blinkDuration;
      if (norm >= 1.0) {
        this.isBlinking = false;
        blinkOpenness = 1.0;
      } else {
        // Triangle wave for smooth blink down & up
        blinkOpenness = Math.abs(norm - 0.5) * 2;
      }
    }

    // 2. Gaze / micro-saccades handling
    this.gazeTimer += deltaTime;
    if (this.gazeTimer >= 2.0) {
      this.gazeTimer = 0;
      // 70% look forward, 30% subtle micro-saccade
      if (Math.random() < 0.3) {
        this.targetGazeX = (Math.random() - 0.5) * 8;
        this.targetGazeY = (Math.random() - 0.5) * 6;
      } else {
        this.targetGazeX = 0;
        this.targetGazeY = 0;
      }
    }

    // Smooth lerp pupil offset
    const gazeSpeed = Math.min(deltaTime * 6, 0.3);
    this.gazeX += (this.targetGazeX - this.gazeX) * gazeSpeed;
    this.gazeY += (this.targetGazeY - this.gazeY) * gazeSpeed;

    return {
      offsetX: this.gazeX,
      offsetY: this.gazeY,
      blinkOpenness,
    };
  }
}

export const eyeGazeEngine = new EyeGazeEngine();
