"use client";

export function BlurredSection() {
  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Blurred teaser content */}
      <div className="blur-sm pointer-events-none select-none" aria-hidden="true">
        <div className="bg-white rounded-2xl p-6 sm:p-8 space-y-6">
          {/* Fake category section */}
          <div>
            <h3 className="font-semibold text-adashi-gulf text-lg mb-3">
              Page-by-Page Analysis
            </h3>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-1" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                  <div className="text-2xl font-bold text-gray-300">85</div>
                </div>
              ))}
            </div>
          </div>

          {/* Fake detailed recommendations */}
          <div>
            <h3 className="font-semibold text-adashi-gulf text-lg mb-3">
              Detailed Recommendations
            </h3>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4">
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-full mb-1" />
                  <div className="h-3 bg-gray-100 rounded w-5/6" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px]">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-adashi-gulf/10 rounded-full mb-4">
          <svg className="w-7 h-7 text-adashi-gulf" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <p className="font-display text-lg text-adashi-gulf mb-1">Full report locked</p>
        <p className="text-sm text-gray-500">Enter your email above to unlock</p>
      </div>
    </div>
  );
}
