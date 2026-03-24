"use client";

import { useState, useEffect } from "react";

const statusMessages = [
  "Loading your site...",
  "Running accessibility checks...",
  "Analyzing content quality...",
  "Checking SEO basics...",
  "Measuring performance...",
  "Generating your report...",
];

export function LoadingState({ url }: { url: string }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % statusMessages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-20 sm:py-32">
      {/* Animated scanner ring */}
      <div className="relative w-32 h-32 mb-8">
        <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
        <div className="absolute inset-0 rounded-full border-4 border-t-adashi-blue border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        <div
          className="absolute inset-3 rounded-full border-4 border-t-transparent border-r-adashi-cyan border-b-transparent border-l-transparent animate-spin"
          style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 bg-adashi-blue rounded-full animate-pulse" />
        </div>
      </div>

      {/* Status message */}
      <p className="text-lg font-medium text-adashi-gulf mb-2 transition-opacity duration-300">
        {statusMessages[messageIndex]}
      </p>
      <p className="text-sm text-gray-400">
        Scanning {url}
      </p>
    </div>
  );
}
