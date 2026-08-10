export class CameraService {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private startPromise: Promise<MediaStream> | null = null;
  private stopRequested = false;
  private readonly retryDelays = [
    300,
    900,
    1500,
  ];

  async start(): Promise<MediaStream> {
    if (this.isRunning() && this.stream) {
      return this.stream;
    }

    if (this.startPromise) {
      if (!this.stopRequested) {
        return this.startPromise;
      }

      await this.startPromise.catch(() => null);
    }

    this.stopRequested = false;

    this.startPromise = this.createStreamWithRetry();

    try {
      const stream = await this.startPromise;

      if (this.stopRequested) {
        this.disposeStream(stream);
        this.disposeVideo();

        throw new DOMException(
          "Camera start was stopped.",
          "AbortError"
        );
      }

      this.stream = stream;

      console.log(
        "Airi Camera: stream stored successfully."
      );

      return this.stream;
    } finally {
      this.startPromise = null;
    }
  }

  private async createStreamWithRetry(): Promise<MediaStream> {
    let lastError: unknown = null;

    for (const video of this.getVideoProfiles()) {
      for (
        let attempt = 0;
        attempt <= this.retryDelays.length;
        attempt += 1
      ) {
        if (this.stopRequested) {
          throw new DOMException(
            "Camera start was stopped.",
            "AbortError"
          );
        }

        try {
          return await this.createStream(video);
        } catch (error) {
          lastError = error;

          if (!this.isRecoverableStartError(error)) {
            throw error;
          }

          const delay =
            this.retryDelays[attempt];

          if (delay === undefined) {
            break;
          }

          await this.wait(delay);
        }
      }
    }

    throw lastError;
  }

  private getVideoProfiles(): Array<boolean | MediaTrackConstraints> {
    return [
      {
        facingMode: "user",
        width: {
          ideal: 1280,
        },
        height: {
          ideal: 720,
        },
        frameRate: {
          ideal: 30,
          max: 30,
        },
      },
      {
        facingMode: "user",
        width: {
          ideal: 640,
        },
        height: {
          ideal: 480,
        },
        frameRate: {
          ideal: 15,
          max: 30,
        },
      },
      true,
    ];
  }

  private async createStream(
    videoProfile: boolean | MediaTrackConstraints
  ): Promise<MediaStream> {
    const stream =
      await navigator.mediaDevices.getUserMedia({
        video: videoProfile,
        audio: false,
      });

    console.log(
      "Airi Camera: getUserMedia succeeded.",
      stream.getVideoTracks()[0]?.label
    );

    const video =
      document.createElement("video");

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    try {
      await video.play();

      console.log(
        "Airi Camera: video playback started."
      );
    } catch (error) {
      this.disposeStream(stream);
      video.srcObject = null;

      throw error;
    }

    this.video = video;

    return stream;
  }

  private isRecoverableStartError(error: unknown): boolean {
    return (
      error instanceof DOMException &&
      (
        error.name === "NotReadableError" ||
        error.name === "OverconstrainedError"
      )
    );
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
  }

  captureFrame(): HTMLCanvasElement | null {
    if (!this.video) {
      return null;
    }

    if (
      this.video.readyState <
      HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return null;
    }

    const canvas =
      document.createElement("canvas");

    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;

    const context =
      canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.drawImage(
      this.video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas;
  }

  captureFrameAsBase64(): string | null {
    const canvas =
      this.captureFrame();

    if (!canvas) {
      return null;
    }

    return canvas.toDataURL(
      "image/jpeg",
      0.75
    );
  }

  stop(): void {
    this.stopRequested = true;

    if (this.stream) {
      this.disposeStream(this.stream);
    }

    this.disposeVideo();

    this.stream = null;
  }

  isRunning(): boolean {
    return (
      this.stream !== null &&
      this.stream
        .getVideoTracks()
        .some(
          (track) =>
            track.readyState === "live"
        )
    );
  }

  private disposeStream(stream: MediaStream): void {
    stream
      .getTracks()
      .forEach((track) => {
        track.stop();
      });
  }

  private disposeVideo(): void {
    if (!this.video) {
      return;
    }

    this.video.pause();
    this.video.srcObject = null;
    this.video = null;
  }
}
