"use client";

interface WebsitePersonalityProps {
  personality: string;
}

export function WebsitePersonalitySection({ personality }: WebsitePersonalityProps) {
  if (!personality) return null;

  return (
    <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8 mb-8">
      <h2 className="font-display text-lg sm:text-xl text-adashi-gulf mb-3">
        How your website comes across
      </h2>
      <div className="border-l-4 border-adashi-blue/30 pl-4">
        <p className="text-gray-600 leading-relaxed italic">
          {personality}
        </p>
      </div>
    </div>
  );
}
