export type AiriState =
  | "INITIALIZING"
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "INTERRUPTED"
  | "ERROR";

export type StateListener = (state: AiriState, prevState: AiriState) => void;

class AiriStateMachine {
  private currentState: AiriState = "INITIALIZING";
  private listeners: Set<StateListener> = new Set();
  private statusMessage: string = "Initializing system components...";

  public getState(): AiriState {
    return this.currentState;
  }

  public getStatusMessage(): string {
    return this.statusMessage;
  }

  public setState(newState: AiriState, message?: string): void {
    if (this.currentState === newState && (!message || message === this.statusMessage)) {
      return;
    }

    const prev = this.currentState;
    this.currentState = newState;
    if (message) {
      this.statusMessage = message;
    } else {
      this.statusMessage = this.getDefaultMessage(newState);
    }

    console.log(`[AIRI][STATE] Transition: ${prev} -> ${newState} (${this.statusMessage})`);
    this.listeners.forEach((fn) => fn(newState, prev));
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private getDefaultMessage(state: AiriState): string {
    switch (state) {
      case "INITIALIZING":
        return "Starting camera, mic & AI engine...";
      case "IDLE":
        return "Listening for your voice...";
      case "LISTENING":
        return "Hearing speech...";
      case "THINKING":
        return "Airi is thinking...";
      case "SPEAKING":
        return "Airi is responding...";
      case "INTERRUPTED":
        return "Interrupted. Listening...";
      case "ERROR":
        return "System error encountered.";
    }
  }
}

export const airiStateMachine = new AiriStateMachine();
