import { VoiceActivityDetector } from "./voiceActivityDetector.ts";
import { DEFAULT_VAD_CONFIG } from "./types.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Test Assertion Failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `Test Assertion Failed: ${message}. Expected: ${String(expected)}, Got: ${String(actual)}`
    );
  }
}

export function runVadLogicTests(): { success: boolean; passed: number } {
  let passed = 0;

  // Test 1: Initial state is IDLE
  {
    const detector = new VoiceActivityDetector();
    assertEqual(detector.getState(), "IDLE", "Test 1: Initial state");
    passed += 1;
  }

  // Test 2: Silence remains IDLE
  {
    let speechStarted = false;
    const detector = new VoiceActivityDetector({
      onSpeechStart: () => {
        speechStarted = true;
      },
    });
    detector.evaluateState(0.0, 1000, new Float32Array(512));
    assertEqual(detector.getState(), "IDLE", "Test 2: Silence state");
    assert(!speechStarted, "Test 2: No speech start on silence");
    passed += 1;
  }

  // Test 3: Short noise spike (< minimumSpeechDurationMs) returns to IDLE
  {
    let speechStarted = false;
    const config = { ...DEFAULT_VAD_CONFIG, minimumSpeechDurationMs: 200 };
    const detector = new VoiceActivityDetector(
      {
        onSpeechStart: () => {
          speechStarted = true;
        },
      },
      config
    );
    detector.evaluateState(0.05, 1000, new Float32Array(512));
    assertEqual(
      detector.getState(),
      "VOICE_DETECTED",
      "Test 3: Spike detected"
    );

    detector.evaluateState(0.01, 1100, new Float32Array(512));
    assertEqual(detector.getState(), "IDLE", "Test 3: Spike rejected");
    assert(!speechStarted, "Test 3: No speech start triggered");
    passed += 1;
  }

  // Test 4 & 5: Sustained voice triggers speechStart and stays SPEAKING
  {
    let speechStarted = false;
    const config = { ...DEFAULT_VAD_CONFIG, minimumSpeechDurationMs: 200 };
    const detector = new VoiceActivityDetector(
      {
        onSpeechStart: () => {
          speechStarted = true;
        },
      },
      config
    );
    detector.evaluateState(0.05, 1000, new Float32Array(512));
    detector.evaluateState(0.05, 1250, new Float32Array(512));
    assertEqual(
      detector.getState(),
      "SPEAKING",
      "Test 4: Transition to SPEAKING"
    );
    assert(speechStarted, "Test 4: speechStart emitted");

    detector.evaluateState(0.05, 1500, new Float32Array(512));
    assertEqual(
      detector.getState(),
      "SPEAKING",
      "Test 5: Remained SPEAKING"
    );
    passed += 1;
  }

  // Test 6 & 7: Short pause drops to SILENCE_DETECTED then resumes SPEAKING
  {
    let speechEnded = false;
    const config = {
      ...DEFAULT_VAD_CONFIG,
      minimumSpeechDurationMs: 200,
      silenceDurationMs: 500,
    };
    const detector = new VoiceActivityDetector(
      {
        onSpeechEnd: () => {
          speechEnded = true;
        },
      },
      config
    );
    detector.evaluateState(0.05, 1000, new Float32Array(512));
    detector.evaluateState(0.05, 1250, new Float32Array(512));

    detector.evaluateState(0.005, 1300, new Float32Array(512));
    assertEqual(
      detector.getState(),
      "SILENCE_DETECTED",
      "Test 6: SILENCE_DETECTED"
    );
    assert(!speechEnded, "Test 6: speechEnd not emitted prematurely");

    detector.evaluateState(0.04, 1500, new Float32Array(512));
    assertEqual(
      detector.getState(),
      "SPEAKING",
      "Test 7: Resumed SPEAKING"
    );
    assert(!speechEnded, "Test 7: speechEnd not emitted");
    passed += 1;
  }

  // Test 8 & 9: Sustained silence triggers speechEnd and returns to IDLE
  {
    let speechEndedBuffer: Float32Array[] | null = null;
    const config = {
      ...DEFAULT_VAD_CONFIG,
      minimumSpeechDurationMs: 200,
      silenceDurationMs: 500,
    };
    const detector = new VoiceActivityDetector(
      {
        onSpeechEnd: (buf) => {
          speechEndedBuffer = buf;
        },
      },
      config
    );
    detector.evaluateState(0.05, 1000, new Float32Array(512));
    detector.evaluateState(0.05, 1250, new Float32Array(512));
    detector.evaluateState(0.005, 1300, new Float32Array(512));
    detector.evaluateState(0.005, 1850, new Float32Array(512));
    assert(
      speechEndedBuffer !== null,
      "Test 8: speechEnd emitted with buffer"
    );
    assertEqual(detector.getState(), "IDLE", "Test 9: Returned to IDLE");
    passed += 1;
  }

  // Test 10: Repeated speech cycles work
  {
    let starts = 0;
    let ends = 0;
    const config = {
      ...DEFAULT_VAD_CONFIG,
      minimumSpeechDurationMs: 200,
      silenceDurationMs: 500,
    };
    const detector = new VoiceActivityDetector(
      {
        onSpeechStart: () => {
          starts += 1;
        },
        onSpeechEnd: () => {
          ends += 1;
        },
      },
      config
    );

    // Cycle 1
    detector.evaluateState(0.05, 1000, new Float32Array(512));
    detector.evaluateState(0.05, 1250, new Float32Array(512));
    detector.evaluateState(0.005, 1300, new Float32Array(512));
    detector.evaluateState(0.005, 1850, new Float32Array(512));
    assertEqual(starts, 1, "Cycle 1 start");
    assertEqual(ends, 1, "Cycle 1 end");

    // Cycle 2
    detector.evaluateState(0.05, 2000, new Float32Array(512));
    detector.evaluateState(0.05, 2250, new Float32Array(512));
    detector.evaluateState(0.005, 2300, new Float32Array(512));
    detector.evaluateState(0.005, 2850, new Float32Array(512));
    assertEqual(starts, 2, "Cycle 2 start");
    assertEqual(ends, 2, "Cycle 2 end");
    passed += 1;
  }

  // Test 11: Hysteresis holds SPEAKING state above endThreshold
  {
    const config = {
      ...DEFAULT_VAD_CONFIG,
      startThreshold: 0.035,
      endThreshold: 0.015,
      minimumSpeechDurationMs: 200,
    };
    const detector = new VoiceActivityDetector({}, config);
    detector.evaluateState(0.04, 1000, new Float32Array(512));
    detector.evaluateState(0.04, 1250, new Float32Array(512));

    detector.evaluateState(0.025, 1300, new Float32Array(512));
    assertEqual(
      detector.getState(),
      "SPEAKING",
      "Hysteresis holds SPEAKING"
    );
    passed += 1;
  }

  // Test 12: Cleanup resets state
  {
    const detector = new VoiceActivityDetector();
    detector.evaluateState(0.05, 1000, new Float32Array(512));
    detector.stop();
    assertEqual(detector.getState(), "IDLE", "Cleanup resets to IDLE");
    passed += 1;
  }

  console.log(`[VAD Unit Tests] Passed all ${passed} test scenarios!`);
  return { success: true, passed };
}
