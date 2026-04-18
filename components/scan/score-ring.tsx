"use client";

import { useEffect, useState } from "react";

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e"; // green-500
  if (score >= 50) return "#eab308"; // yellow-500
  return "#ef4444"; // red-500
}

function getScoreBg(score: number): string {
  if (score >= 80) return "rgba(34, 197, 94, 0.1)";
  if (score >= 50) return "rgba(234, 179, 8, 0.1)";
  return "rgba(239, 68, 68, 0.1)";
}

export function ScoreRing({ score, size = 160, strokeWidth = 10, label }: ScoreRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;
  const color = getScoreColor(score);

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatedScore(score), 100);
    return () => clearTimeout(timeout);
  }, [score]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill={getScoreBg(score)}
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold" style={{ color }}>{score}</span>
          <span className="text-xs text-gray-500 font-medium">/ 100</span>
        </div>
      </div>
      {label && <span className="text-sm font-medium text-gray-600">{label}</span>}
    </div>
  );
}

export function ScoreRingSmall({ score, label, pending }: { score: number; label: string; pending?: boolean }) {
  return (
    <div className="relative">
      <ScoreRing score={score} size={90} strokeWidth={7} label={label} />
      {pending && (
        <span
          className="absolute top-0 right-1/2 translate-x-8 -translate-y-1 flex h-2.5 w-2.5"
          title="Analyzing design..."
        >
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
        </span>
      )}
    </div>
  );
}
