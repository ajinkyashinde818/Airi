export class FrameChangeDetector {
  private previousFrame:
    | Uint8ClampedArray
    | null = null;

  private readonly width = 64;
  private readonly height = 36;

  private readonly threshold = 0.08;

  async hasMeaningfulChange(
    base64Image: string
  ): Promise<boolean> {

    const image = await this.loadImage(
      base64Image
    );

    const canvas =
      document.createElement("canvas");

    canvas.width = this.width;
    canvas.height = this.height;

    const context =
      canvas.getContext("2d");

    if (!context) {
      return true;
    }

    context.drawImage(
      image,
      0,
      0,
      this.width,
      this.height
    );

    const imageData =
      context.getImageData(
        0,
        0,
        this.width,
        this.height
      );

    const currentFrame =
      imageData.data;

    if (!this.previousFrame) {
      this.previousFrame =
        new Uint8ClampedArray(
          currentFrame
        );

      return true;
    }

    let difference = 0;

    const length =
      currentFrame.length;

    for (
      let i = 0;
      i < length;
      i += 4
    ) {
      const r =
        Math.abs(
          currentFrame[i] -
          this.previousFrame[i]
        );

      const g =
        Math.abs(
          currentFrame[i + 1] -
          this.previousFrame[i + 1]
        );

      const b =
        Math.abs(
          currentFrame[i + 2] -
          this.previousFrame[i + 2]
        );

      difference +=
        (r + g + b) / 3;
    }

    const averageDifference =
      difference /
      (length / 4) /
      255;

    this.previousFrame =
      new Uint8ClampedArray(
        currentFrame
      );

    return (
      averageDifference >=
      this.threshold
    );
  }

  reset(): void {
    this.previousFrame = null;
  }

  private loadImage(
    source: string
  ): Promise<HTMLImageElement> {

    return new Promise(
      (resolve, reject) => {

        const image =
          new Image();

        image.onload = () =>
          resolve(image);

        image.onerror = () =>
          reject(
            new Error(
              "Failed to decode camera frame."
            )
          );

        image.src = source;
      }
    );
  }
}

export const frameChangeDetector =
  new FrameChangeDetector();