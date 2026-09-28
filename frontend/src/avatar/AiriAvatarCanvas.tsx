import React, { useEffect, useRef } from "react";
import { expressionEngine } from "./expressionEngine";
import { eyeGazeEngine } from "./eyeGazeEngine";
import { lipSyncEngine } from "./lipSyncEngine";
import { airiStateMachine } from "../state/airiStateMachine";
import type { AiriState } from "../state/airiStateMachine";

interface AiriAvatarCanvasProps {
  emotion?: string;
  width?: number;
  height?: number;
}

export const AiriAvatarCanvas: React.FC<AiriAvatarCanvasProps> = ({
  emotion = "neutral",
  width = 500,
  height = 500,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = (time: number) => {
      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;

      // Update sub-engines
      expressionEngine.setEmotion(emotion);
      const face = expressionEngine.update(deltaTime);
      const gaze = eyeGazeEngine.update(deltaTime);
      const mouth = lipSyncEngine.update(deltaTime);
      const airiState: AiriState = airiStateMachine.getState();

      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      // 1. Ambient Emotion Glow Background
      const glowGradient = ctx.createRadialGradient(cx, cy, 50, cx, cy, 220);
      glowGradient.addColorStop(0, `${face.glowColor}44`);
      glowGradient.addColorStop(0.7, `${face.glowColor}11`);
      glowGradient.addColorStop(1, "transparent");

      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, 220, 0, Math.PI * 2);
      ctx.fill();

      // 2. Pulse Ring for Thinking / Speaking / Listening state
      const pulseTime = time / 1000;
      ctx.lineWidth = 2;
      ctx.strokeStyle = `${face.glowColor}66`;
      ctx.beginPath();
      const ringRadius = 160 + Math.sin(pulseTime * 4) * (airiState === "THINKING" ? 10 : 3);
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      // 3. Avatar Face Silhouette / Head Shape
      ctx.fillStyle = "#0f172a";
      ctx.strokeStyle = `${face.glowColor}aa`;
      ctx.lineWidth = 3;

      ctx.beginPath();
      // Smooth face oval shape
      ctx.ellipse(cx, cy, 110, 140, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 4. Blush (Cheeks)
      if (face.blushOpacity > 0.05) {
        ctx.fillStyle = `rgba(244, 114, 182, ${face.blushOpacity})`;
        ctx.beginPath();
        ctx.ellipse(cx - 55, cy + 25, 20, 10, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 55, cy + 25, 20, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Eyebrows
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";

      const angleRad = (face.eyebrowAngle * Math.PI) / 180;
      // Left Eyebrow
      ctx.save();
      ctx.translate(cx - 45, cy - 45 - face.eyebrowHeight);
      ctx.rotate(-angleRad);
      ctx.beginPath();
      ctx.moveTo(-25, 0);
      ctx.lineTo(25, 0);
      ctx.stroke();
      ctx.restore();

      // Right Eyebrow
      ctx.save();
      ctx.translate(cx + 45, cy - 45 - face.eyebrowHeight);
      ctx.rotate(angleRad);
      ctx.beginPath();
      ctx.moveTo(-25, 0);
      ctx.lineTo(25, 0);
      ctx.stroke();
      ctx.restore();

      // 6. Glowing AI Eyes
      const eyeOpenH = 22 * face.eyeScaleY * gaze.blinkOpenness;
      const eyeW = 28;

      const drawEye = (ex: number, ey: number) => {
        // Eye socket
        ctx.fillStyle = "#1e293b";
        ctx.strokeStyle = face.glowColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(ex, ey, eyeW, Math.max(eyeOpenH, 1), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Pupil / Iris
        if (gaze.blinkOpenness > 0.1) {
          ctx.fillStyle = face.glowColor;
          ctx.shadowColor = face.glowColor;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.ellipse(
            ex + gaze.offsetX,
            ey + gaze.offsetY,
            10,
            Math.max(10 * face.eyeScaleY * gaze.blinkOpenness, 1),
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
          ctx.shadowBlur = 0; // reset

          // Pupil Highlight catchlight
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(ex + gaze.offsetX - 3, ey + gaze.offsetY - 3, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      drawEye(cx - 45, cy - 15);
      drawEye(cx + 45, cy - 15);

      // 7. Interactive Mouth (Lip-Sync Engine)
      const mouthY = cy + 50;
      const mouthOpenH = mouth.openRatio * 32;
      const mouthW = 35 * mouth.widthRatio;

      ctx.fillStyle = "#334155";
      ctx.strokeStyle = face.glowColor;
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      if (mouthOpenH < 2) {
        // Smile curve / line when silent
        ctx.moveTo(cx - mouthW, mouthY);
        ctx.quadraticCurveTo(cx, mouthY + (face.eyebrowAngle > 0 ? 8 : 4), cx + mouthW, mouthY);
        ctx.stroke();
      } else {
        // Open mouth during speech visemes
        ctx.ellipse(cx, mouthY, mouthW, mouthOpenH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Tongue highlight
        ctx.fillStyle = "#f43f5e";
        ctx.beginPath();
        ctx.ellipse(cx, mouthY + mouthOpenH * 0.4, mouthW * 0.5, mouthOpenH * 0.4, 0, 0, Math.PI);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [emotion, width, height]);

  return (
    <div className="airi-avatar-container" style={{ position: "relative", display: "inline-block" }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          filter: "drop-shadow(0 0 20px rgba(56, 189, 248, 0.3))",
        }}
      />
    </div>
  );
};
