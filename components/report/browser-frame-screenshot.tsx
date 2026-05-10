"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { IssueOverlay, IssueCategory } from "@/types/scanner";

interface BrowserFrameScreenshotProps {
  screenshotUrl: string;
  overlays: IssueOverlay[];
  pageUrl: string;
  /** Y coordinate (in page space) to center the viewport on. Defaults to 0. */
  scrollHint?: number;
}

const VIEWPORT_HEIGHT = 220;

const categoryColors: Record<IssueCategory, { bg: string; ring: string }> = {
  accessibility: { bg: "bg-red-500", ring: "ring-red-300" },
  content:       { bg: "bg-orange-500", ring: "ring-orange-300" },
  seo:           { bg: "bg-blue-500", ring: "ring-blue-300" },
  performance:   { bg: "bg-yellow-500", ring: "ring-yellow-300" },
  security:      { bg: "bg-purple-500", ring: "ring-purple-300" },
  design:        { bg: "bg-pink-500", ring: "ring-pink-300" },
};

export function BrowserFrameScreenshot({
  screenshotUrl,
  overlays,
  pageUrl,
  scrollHint = 0,
}: BrowserFrameScreenshotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState({ x: 1, y: 1 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hoveredPin, setHoveredPin] = useState<number | null>(null);

  const parsedUrl = (() => {
    try { return new URL(pageUrl); } catch { return null; }
  })();
  const displayUrl = parsedUrl
    ? parsedUrl.pathname === "/"
      ? parsedUrl.hostname
      : `${parsedUrl.hostname}${parsedUrl.pathname}`
    : pageUrl;

  const updateScale = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const renderedWidth = img.clientWidth;
    const renderedHeight = img.clientHeight;
    if (renderedWidth > 0 && renderedHeight > 0) {
      const originalWidth = overlays.length ? overlays[0].pageWidth : renderedWidth;
      const originalHeight = overlays.length ? overlays[0].pageHeight : renderedHeight;
      if (originalWidth > 0 && originalHeight > 0) {
        setScale({ x: renderedWidth / originalWidth, y: renderedHeight / originalHeight });
      }
    }
  }, [overlays]);

  useEffect(() => {
    if (!imageLoaded) return;
    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [imageLoaded, updateScale]);

  // Convert scrollHint (page coords) to pixel offset in rendered space
  // Center the focal point in the 220px viewport, but don't go negative
  const imageOffset = imageLoaded
    ? Math.max(0, scrollHint * scale.y - VIEWPORT_HEIGHT / 2)
    : 0;

  return (
    <div className="mb-6">
      {/* Browser chrome */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <div className="bg-gray-100 border-b border-gray-200 px-3 py-2 flex items-center gap-2">
          <div className="flex gap-1.5 flex-shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-white rounded-md px-2 py-0.5 text-xs text-gray-500 truncate border border-gray-200">
            {displayUrl}
          </div>
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-gray-400 hover:text-gray-600"
            aria-label="Open page"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        {/* Scrollable screenshot viewport */}
        <div
          ref={containerRef}
          className="relative overflow-hidden bg-gray-50"
          style={{ height: `${VIEWPORT_HEIGHT}px` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={screenshotUrl}
            alt={`Screenshot of ${displayUrl}`}
            className="absolute w-full h-auto block"
            style={{ top: `-${imageOffset}px` }}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
          />

          {imageLoaded && overlays.map((overlay, i) => {
            const colors = categoryColors[overlay.category] || categoryColors.accessibility;
            const cx = (overlay.rect.x + overlay.rect.width / 2) * scale.x;
            const cy = (overlay.rect.y + overlay.rect.height / 2) * scale.y - imageOffset;
            const isHovered = hoveredPin === i;

            // Don't render pins outside the visible viewport
            if (cy < -10 || cy > VIEWPORT_HEIGHT + 10) return null;

            return (
              <div
                key={overlay.issueId}
                className={`absolute z-10 w-5 h-5 rounded-full ${colors.bg} text-white flex items-center justify-center text-[10px] font-bold cursor-default ring-2 ${colors.ring} transition-transform ${isHovered ? "scale-125" : ""}`}
                style={{ left: cx - 10, top: cy - 10 }}
                onMouseEnter={() => setHoveredPin(i)}
                onMouseLeave={() => setHoveredPin(null)}
              >
                {i + 1}
                {isHovered && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg shadow-lg whitespace-nowrap z-20 pointer-events-none">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                      {overlay.severity} · {overlay.category}
                    </p>
                    <p className="text-xs text-gray-700 max-w-[220px] whitespace-normal">{overlay.issueTitle}</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Fade at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white/60 to-transparent pointer-events-none" />
          {/* Fade at top when scrolled */}
          {imageOffset > 0 && (
            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />
          )}
        </div>
      </div>

      {/* Pin legend */}
      {overlays.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {overlays.map((overlay, i) => {
            const colors = categoryColors[overlay.category] || categoryColors.accessibility;
            return (
              <span
                key={overlay.issueId}
                className="flex items-center gap-1.5 text-xs text-gray-600"
                onMouseEnter={() => setHoveredPin(i)}
                onMouseLeave={() => setHoveredPin(null)}
              >
                <span className={`inline-flex w-4 h-4 rounded-full ${colors.bg} text-white items-center justify-center text-[9px] font-bold flex-shrink-0`}>
                  {i + 1}
                </span>
                <span className="truncate max-w-[180px]">{overlay.issueTitle}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
