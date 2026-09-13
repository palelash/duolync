export type ReportReasonValue =
  | "SCAM_FRAUD"
  | "INAPPROPRIATE_CONTENT"
  | "UNPROFESSIONAL_BEHAVIOR"
  | "SPAM"
  | "OTHER";

export const REPORT_REASON_LABELS: Record<ReportReasonValue, string> = {
  SCAM_FRAUD: "Scam / Fraud",
  INAPPROPRIATE_CONTENT: "Inappropriate Content",
  UNPROFESSIONAL_BEHAVIOR: "Unprofessional Behavior",
  SPAM: "Spam",
  OTHER: "Other",
};
