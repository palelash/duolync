"use client";

import { useState, useTransition } from "react";
import { Flag, Loader2, Send, CheckCircle2, AlertTriangle, User, Megaphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { submitReport } from "@/app/actions/reports";
import {
  REPORT_REASON_LABELS,
  type ReportReasonValue,
} from "@/lib/report-constants";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetUser?: {
    id: string;
    name?: string | null;
    type?: string;
  };
  targetCampaign?: {
    id: string;
    title: string;
  };
}

const REASON_OPTIONS = Object.entries(REPORT_REASON_LABELS) as [ReportReasonValue, string][];

// ── ReportModal ───────────────────────────────────────────────────────────────

export function ReportModal({ open, onClose, targetUser, targetCampaign }: ReportModalProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState<ReportReasonValue | "">("");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  const subjectLabel = targetCampaign
    ? targetCampaign.title
    : (targetUser?.name ?? "this user");

  const charCount = description.length;
  const canSubmit = reason !== "" && description.trim().length >= 10 && !isPending;

  function resetAndClose() {
    setReason("");
    setDescription("");
    onClose();
  }

  function handleSubmit() {
    if (!reason) return;

    startTransition(async () => {
      const result = await submitReport({
        reason,
        description,
        targetUserId: targetUser?.id,
        campaignId: targetCampaign?.id,
      });

      if (result.success) {
        toast({
          title: "Report submitted",
          description:
            "Our team will review your report and take appropriate action. Thank you for helping keep the community safe.",
        });
        resetAndClose();
      } else {
        toast({
          variant: "destructive",
          title: "Failed to submit report",
          description: result.error,
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
      <DialogContent className="sm:max-w-[440px] p-0 gap-0 overflow-hidden border-zinc-800 bg-zinc-950 text-zinc-100">
        {/* Accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-red-500 via-orange-400 to-amber-500" />

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15 ring-1 ring-red-500/20">
              <Flag className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-zinc-100">
                Submit a report
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 mt-0.5">
                Reporting{" "}
                <span className="font-medium text-zinc-300">
                  {targetCampaign ? (
                    <><Megaphone className="inline h-3 w-3 mr-0.5 -mt-0.5" />{subjectLabel}</>
                  ) : (
                    <><User className="inline h-3 w-3 mr-0.5 -mt-0.5" />{subjectLabel}</>
                  )}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Form body */}
        <div className="px-6 py-5 space-y-5">
          {/* Reason selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              Reason <span className="text-red-500">*</span>
            </label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as ReportReasonValue)}
            >
              <SelectTrigger className="h-10 border-zinc-700 bg-zinc-900 text-zinc-200 focus:ring-red-500/40 data-[placeholder]:text-zinc-500">
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
                {REASON_OPTIONS.map(([value, label]) => (
                  <SelectItem
                    key={value}
                    value={value}
                    className="focus:bg-zinc-800 focus:text-zinc-100"
                  >
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Description <span className="text-red-500">*</span>
              </label>
              <span
                className={`text-[10px] tabular-nums ${
                  charCount > 1800
                    ? "text-amber-400"
                    : charCount > 0
                    ? "text-zinc-500"
                    : "text-zinc-700"
                }`}
              >
                {charCount}/2000
              </span>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened in as much detail as possible…"
              rows={4}
              maxLength={2000}
              className="resize-none border-zinc-700 bg-zinc-900 text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-red-500/40 focus-visible:border-red-500/40"
            />
            {description.length > 0 && description.trim().length < 10 && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-400">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Please provide at least 10 characters.
              </p>
            )}
          </div>

          {/* Success visual cue while pending */}
          {isPending && (
            <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" />
              <p className="text-sm text-zinc-400">Submitting your report…</p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[10px] leading-relaxed text-zinc-600">
            False or malicious reports may result in action against your account. All
            reports are reviewed by our moderation team.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={resetAndClose}
            disabled={isPending}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="gap-1.5 bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Submit report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Trigger button (convenience wrapper) ──────────────────────────────────────

interface ReportButtonProps {
  targetUser?: ReportModalProps["targetUser"];
  targetCampaign?: ReportModalProps["targetCampaign"];
  /** Override the button's visual style. Defaults to a small icon-only ghost button. */
  variant?: "icon" | "text" | "text-sm";
  className?: string;
}

export function ReportButton({
  targetUser,
  targetCampaign,
  variant = "icon",
  className = "",
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          title="Report"
          className={`inline-flex items-center justify-center rounded-lg border border-transparent p-2 text-zinc-500 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-400 ${className}`}
        >
          <Flag className="h-4 w-4" />
        </button>
      ) : variant === "text-sm" ? (
        <button
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-transparent px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-400 ${className}`}
        >
          <Flag className="h-3 w-3" />
          Report
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-400 ${className}`}
        >
          <Flag className="h-4 w-4" />
          Report
        </button>
      )}

      <ReportModal
        open={open}
        onClose={() => setOpen(false)}
        targetUser={targetUser}
        targetCampaign={targetCampaign}
      />
    </>
  );
}
