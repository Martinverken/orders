import { OrderUrgency } from "@/app/types";
import { URGENCY_CLASSES, URGENCY_LABEL, STATUS_CLASSES, STATUS_LABEL } from "@/app/lib/utils";

interface BadgeProps {
  urgency: OrderUrgency;
}

export function UrgencyBadge({ urgency }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${URGENCY_CLASSES[urgency]}`}
    >
      {URGENCY_LABEL[urgency]}
    </span>
  );
}

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = STATUS_LABEL[status] ?? status;
  const classes = STATUS_CLASSES[status] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${classes}`}>
      {label}
    </span>
  );
}
