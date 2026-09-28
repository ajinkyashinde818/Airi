export class MicrophoneService {
  private stream: MediaStream | null = null;
  private startPromise: Promise<MediaStream> | null = null;
  private stopRequested = false;

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

    this.startPromise = this.createStream();

    try {
      const stream = await this.startPromise;

      if (this.stopRequested) {
        this.disposeStream(stream);

        throw new DOMException(
          "Microphone start was stopped.",
          "AbortError"
        );
      }

      this.stream = stream;

      console.log(
        "Airi Voice: microphone stream stored successfully."
      );

      return this.stream;
    } finally {
      this.startPromise = null;
    }
  }

  private async createStream(): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new DOMException(
        "MediaDevices API is not supported in this browser.",
        "NotSupportedError"
      );
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    console.log(
      "Airi Voice: microphone getUserMedia succeeded.",
      stream.getAudioTracks()[0]?.label
    );

    return stream;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  stop(): void {
    this.stopRequested = true;

    if (this.stream) {
      this.disposeStream(this.stream);
      this.stream = null;
    }

    console.log(
      "Airi Voice: microphone stopped."
    );
  }

  isRunning(): boolean {
    return (
      this.stream !== null &&
      this.stream
        .getAudioTracks()
        .some((track) => track.readyState === "live")
    );
  }

  private disposeStream(stream: MediaStream): void {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }
}
