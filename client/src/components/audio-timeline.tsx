import { useEffect, useRef, useState } from "react";

// Renders a waveform timeline with optional start/end time labels

interface AudioTimelineProps {
  fileUrl: string;
  startTime?: string | Date;
  duration?: number; // seconds
  audioRef?: React.RefObject<HTMLAudioElement>;
}

export function AudioTimeline({ fileUrl, startTime, duration, audioRef }: AudioTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [segments, setSegments] = useState<number[]>([]);
  const animationRef = useRef<number>();

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

  // Format seconds into H:MM
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}` : `${m}m`;
  };

  // Determine interval for timeline markers
  const getInterval = (total: number) => {
    if (total > 3600) return 3600; // 1 hour
    if (total > 600) return 600; // 10 minutes
    return 60; // 1 minute
  };

  // Draw waveform, timeline, and playback progress
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || segments.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const timelineHeight = 12;
      const waveformHeight = height - timelineHeight;
      ctx.clearRect(0, 0, width, height);

      // Draw waveform bars
      segments.forEach((value, index) => {
        const x = (index / segments.length) * width;
        const barWidth = width / segments.length;
        const barHeight = value * waveformHeight;
        ctx.fillStyle = value > 0.02 ? "#facc15" : "#e5e7eb"; // yellow for voice
        ctx.fillRect(x, waveformHeight - barHeight, barWidth, barHeight);
      });

      const total = duration || audioRef?.current?.duration || 0;

      // Draw timeline markers
      if (total > 0) {
        const interval = getInterval(total);
        for (let t = interval; t < total; t += interval) {
          const x = (t / total) * width;
          ctx.strokeStyle = "#94a3b8";
          ctx.beginPath();
          ctx.moveTo(x, waveformHeight);
          ctx.lineTo(x, waveformHeight + 4);
          ctx.stroke();

          const label = formatTime(t);
          ctx.fillStyle = "#475569";
          ctx.font = "10px sans-serif";
          const textWidth = ctx.measureText(label).width;
          ctx.fillText(label, x - textWidth / 2, height - 2);
        }
      }

      // Draw progress indicator
      const audio = audioRef?.current;
      if (audio && total > 0) {
        const progress = audio.currentTime / total;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(progress * width, 0, 2, waveformHeight);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [segments, audioRef, duration]);

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
      <canvas ref={canvasRef} width={400} height={50} className="h-12 flex-1" />
      <span className="text-xs text-gray-600 w-14 text-right">{endLabel}</span>
    </div>
  );
}

export default AudioTimeline;
