import { useEffect, useRef, useState } from "react";

// Renders a simple waveform visualization for an audio file

interface AudioTimelineProps {
  fileUrl: string;
}

export function AudioTimeline({ fileUrl }: AudioTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [segments, setSegments] = useState<number[]>([]);

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
      ctx.fillStyle = value > 0.05 ? "#2563eb" : "#cbd5e1";
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
    });
  }, [segments]);

  return <canvas ref={canvasRef} width={400} height={60} className="w-full h-16" />;
}

export default AudioTimeline;
