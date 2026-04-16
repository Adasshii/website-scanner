"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { IssueOverlay, IssueCategory } from "@/types/scanner";

interface AnnotatedScreenshotProps {
  screenshotUrl: string;
  overlays: IssueOverlay[];
  pageUrl: string;
  compact?: boolean;
}

const categoryColors: Record<IssueCategory, { bg: string; border: string; text: string }> = {
  accessibility: { bg: "bg-red-500/15", border: "border-red-500", text: "text-red-700" },
  content: { bg: "bg-orange-500/15", border: "border-orange-500", text: "text-orange-700" },
  seo: { bg: "bg-blue-500/15", border: "border-blue-500", text: "text-blue-700" },
  performance: { bg: "bg-yellow-500/15", border: "border-yellow-500", text: "text-yellow-700" },
  security: { bg: "bg-purple-500/15", border: "border-purple-500", text: "text-purple-700" },
};

export function AnnotatedScreenshot({
  screenshotUrl,
  overlays,
  pageUrl,
  compact = false,
}: AnnotatedScreenshotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState({ x: 1, y: 1 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hoveredOverlay, setHoveredOverlay] = useState<string | null>(null);

  const updateScale = useCallback(() => {
    const img = imgRef.current;
    if (!img || !overlays.length) return;

    const renderedWidth = img.clientWidth;
    const renderedHeight = img.clientHeight;
    const originalWidth = overlays[0].pageWidth;
    const originalHeight = overlays[0].pageHeight;

    if (originalWidth > 0 && originalHeight > 0) {
      setScale({
        x: renderedWidth / originalWidth,
        y: renderedHeight / originalHeight,
      });
    }
  }, [overlays]);

  useEffect(() => {
    if (!imageLoaded) return;
    updateScale();

    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [imageLoaded, updateScale]);

  if (compact) {
    return (
      <div className="relative rounded-lg overflow-hidden border border-gray-200 max-w-[200px]">
        <img
          src={screenshotUrl}
          alt={`Screenshot of ${pageUrl}`}
          className="w-full h-auto"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div ref={containerRef} className="relative rounded-xl overflow-hidden border border-gray-200">
        <img
          ref={imgRef}
          src={screenshotUrl}
          alt={`Screenshot of ${pageUrl}`}
          className="w-full h-auto block"
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
        />

        {/* Overlay rectangles */}
        {imageLoaded &&
          overlays.map((overlay) => {
            const colors = categoryColors[overlay.category] || categoryColors.accessibility;
            const isHovered = hoveredOverlay === overlay.issueId;

            return (
              <div
                key={overlay.issueId}
                className={`absolute border-2 ${colors.border} ${colors.bg} cursor-pointer transition-opacity ${
                  isHovered ? "opacity-100" : "opacity-70"
                }`}
                style={{
                  left: `${overlay.rect.x * scale.x}px`,
                  top: `${overlay.rect.y * scale.y}px`,
                  width: `${Math.max(overlay.rect.width * scale.x, 20)}px`,
                  height: `${Math.max(overlay.rect.height * scale.y, 20)}px`,
                }}
                onMouseEnter={() => setHoveredOverlay(overlay.issueId)}
                onMouseLeave={() => setHoveredOverlay(null)}
              >
                {/* Tooltip */}
                {isHovered && (
                  <div
                    className={`absolute bottom-full left-0 mb-2 px-3 py-2 rounded-lg bg-white shadow-lg border border-gray-200 whitespace-nowrap z-10 max-w-[300px]`}
                  >
                    <div className={`text-xs font-semibold ${colors.text} mb-0.5`}>
                      {overlay.severity.toUpperCase()} · {overlay.category}
                    </div>
                    <div className="text-sm text-gray-700 whitespace-normal">
                      {overlay.issueTitle}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Legend */}
      {overlays.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
          {Object.entries(categoryColors).map(([cat, colors]) => {
            const count = overlays.filter((o) => o.category === cat).length;
            if (count === 0) return null;
            return (
              <span key={cat} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-sm ${colors.border} border-2`} />
                {cat} ({count})
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
