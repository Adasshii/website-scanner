"use client";

interface EmailStatusBadgeProps {
  emailType: string;
  status: string;
}

const statusStyles: Record<string, string> = {
  sent: "bg-gray-100 text-gray-600",
  delivered: "bg-blue-50 text-blue-700",
  opened: "bg-green-50 text-green-700",
  clicked: "bg-emerald-50 text-emerald-700 font-semibold",
  bounced: "bg-red-50 text-red-700",
  complained: "bg-red-50 text-red-700",
  failed: "bg-red-50 text-red-700",
};

const typeLabels: Record<string, string> = {
  confirmation: "Confirm",
  report_ready: "Report",
  follow_up: "Follow-up",
  admin_notification: "Admin",
};

export function EmailStatusBadge({ emailType, status }: EmailStatusBadgeProps) {
  const style = statusStyles[status] || statusStyles.sent;
  const label = typeLabels[emailType] || emailType;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${style}`}>
      <span className="opacity-60">{label}:</span>
      <span>{status}</span>
    </span>
  );
}

interface EmailStatusGroupProps {
  emailStatuses: Array<{ email_type: string; status: string }>;
}

export function EmailStatusGroup({ emailStatuses }: EmailStatusGroupProps) {
  if (!emailStatuses || emailStatuses.length === 0) {
    return <span className="text-xs text-gray-300">No emails</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {emailStatuses.map((es, i) => (
        <EmailStatusBadge key={i} emailType={es.email_type} status={es.status} />
      ))}
    </div>
  );
}
