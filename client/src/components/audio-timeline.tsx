import { useEffect, useRef, useState } from "react";

// Renders a waveform timeline with optional start/end time labels

interface AudioTimelineProps {
  fileUrl: string;
  startTime?: string | Date;
  duration?: number; // seconds
}

export function AudioTimeline({ fileUrl, startTime, duration }: AudioTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [segments, setSegments] = useState<number[]>([]);

  // Analyze the audio file once to generate simple amplitude segments
  useEffect(() => {
    const analyze = async () => {
      try {
        const res = await fetch(fileUrl);
        const arrayBuffer = await res.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0);
        const sampleSize = Math.floor(rawData.length / 100);
        const amplitude: number[] = [];
        for (let i = 0; i < 100; i++) {
          let sum = 0;
          for (let j = 0; j < sampleSize; j++) {
            sum += Math.abs(rawData[i * sampleSize + j]);
          }
          amplitude.push(sum / sampleSize);
        }
        setSegments(amplitude);
      } catch (err) {
        console.error("Audio analysis failed", err);
      }
    };
    analyze();
  }, [fileUrl]);

  // Draw the waveform bars
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || segments.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    segments.forEach((value, index) => {
      const x = (index / segments.length) * width;
      const barWidth = width / segments.length;
      const barHeight = value * height;
      ctx.fillStyle = value > 0.05 ? "#facc15" : "#e5e7eb"; // yellow when voice is detected
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
    });
  }, [segments]);

  const startLabel = startTime
    ? new Date(startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "0:00";

  const endLabel = (() => {
    if (startTime && typeof duration === "number") {
      const end = new Date(new Date(startTime).getTime() + duration * 1000);
      return end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return duration ? `${duration}s` : "";
  })();

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs text-gray-600 w-14 text-left">{startLabel}</span>
      <canvas ref={canvasRef} width={400} height={40} className="h-10 flex-1" />
      <span className="text-xs text-gray-600 w-14 text-right">{endLabel}</span>
    </div>
  );
}

export default AudioTimeline;
