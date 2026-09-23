"use client";

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Plus, Pencil, Trash2, X, Calendar, DollarSign,
  FileText, Users, ChevronRight, Target, TrendingUp,
  Megaphone, Clock, CheckCircle2, Layers, PauseCircle, XCircle,
  ImagePlus, ChevronDown, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import MainLayout from "@/components/layout/MainLayout";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RichEmptyState } from "@/app/_components/shared/RichEmptyState";
import {
  getBrandCampaignsAction,
  createCampaignAction,
  updateCampaignAction,
  deleteCampaignAction,
  getCampaignConnectionsAction,
  type CampaignData,
  type ConnectedCreator,
} from "@/app/actions/campaigns";

// ── Platform config ───────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: "instagram", label: "Instagram", emoji: "📸", color: "from-pink-500 to-orange-400" },
  { id: "tiktok", label: "TikTok", emoji: "🎵", color: "from-black to-zinc-700" },
  { id: "youtube", label: "YouTube", emoji: "▶️", color: "from-red-600 to-red-500" },
  { id: "twitter", label: "X / Twitter", emoji: "🐦", color: "from-sky-500 to-blue-500" },
  { id: "linkedin", label: "LinkedIn", emoji: "💼", color: "from-blue-700 to-blue-600" },
  { id: "pinterest", label: "Pinterest", emoji: "📌", color: "from-red-500 to-rose-400" },
  { id: "twitch", label: "Twitch", emoji: "🎮", color: "from-purple-600 to-violet-500" },
  { id: "snapchat", label: "Snapchat", emoji: "👻", color: "from-yellow-400 to-amber-300" },
] as const;

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT: {
    label: "Draft",
    color: "bg-zinc-800/60 text-zinc-400 border border-zinc-700/60",
    icon: Layers,
  },
  ACTIVE: {
    label: "Active",
    color: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15",
    icon: TrendingUp,
  },
  PAUSED: {
    label: "Paused",
    color: "bg-amber-500/10 text-amber-400 border border-amber-500/15",
    icon: PauseCircle,
  },
  COMPLETED: {
    label: "Completed",
    color: "bg-blue-500/10 text-blue-400 border border-blue-500/15",
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: "Cancelled",
    color: "bg-red-500/10 text-red-400 border border-red-500/15",
    icon: XCircle,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBudget(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function formatFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function formatDeadline(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function timeUntilDeadline(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Overdue";
  const days = Math.ceil(diff / 86_400_000);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days}d remaining`;
}

function getPlatformMeta(id: string) {
  return PLATFORMS.find((p) => p.id === id);
}

// ── Image compression ─────────────────────────────────────────────────────────

function compressImage(file: File, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unavailable")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Image Upload Field ────────────────────────────────────────────────────────

interface ImageUploadFieldProps {
  value: string | null;
  onChange: (url: string | null) => void;
}

function ImageUploadField({ value, onChange }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be under 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressImage(file, 900, 0.82);
      onChange(compressed);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Product / Campaign Image</label>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !value && inputRef.current?.click()}
        className={cn(
          "relative w-full rounded-xl border-2 border-dashed transition-all overflow-hidden",
          value
            ? "border-primary/30 cursor-default"
            : "border-zinc-300 dark:border-zinc-700 hover:border-primary/50 cursor-pointer hover:bg-primary/5",
        )}
      >
        {value ? (
          <div className="relative w-full h-40">
            <img src={value} alt="Campaign" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-zinc-900 text-xs font-semibold hover:bg-white transition-colors"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                Change
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/90 text-white text-xs font-semibold hover:bg-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
            {uploading ? (
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <ImagePlus className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Drag & drop or click to upload
                </p>
                <p className="text-xs text-muted-foreground">PNG, JPG, WEBP · Max 5 MB</p>
              </>
            )}
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Platform Selector ─────────────────────────────────────────────────────────

interface PlatformSelectorProps {
  value: string[];
  onChange: (platforms: string[]) => void;
}

function PlatformSelector({ value, onChange }: PlatformSelectorProps) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((p) => p !== id) : [...value, id]);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Target Platforms</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PLATFORMS.map((p) => {
          const selected = value.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all",
                selected
                  ? "border-primary bg-primary/10 text-primary dark:bg-primary/15"
                  : "border-zinc-200 dark:border-zinc-700 text-muted-foreground hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-foreground",
              )}
            >
              <span className="text-base leading-none">{p.emoji}</span>
              <span className="truncate text-xs">{p.label}</span>
              {selected && (
                <span className="ml-auto w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">Select at least one platform (optional)</p>
      )}
    </div>
  );
}

// ── Date Picker ───────────────────────────────────────────────────────────────

interface DatePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
}

function DatePicker({ value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Deadline (optional)</label>
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex-1 flex items-center gap-3 px-3 h-10 rounded-md border text-sm text-left transition-colors",
                "border-input bg-background hover:bg-secondary",
                !value && "text-muted-foreground",
              )}
            >
              <Calendar className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">
                {value ? format(value, "MMM d, yyyy") : "Pick a deadline"}
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarUI
              mode="single"
              selected={value}
              onSelect={(d) => { onChange(d); setOpen(false); }}
              disabled={(d) => d < today}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="h-10 w-10 shrink-0 flex items-center justify-center rounded-md border border-input bg-background hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Clear date"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {value && (
        <p className="text-xs text-muted-foreground">
          {timeUntilDeadline(value.toISOString())}
        </p>
      )}
    </div>
  );
}

// ── Campaign Form Modal ───────────────────────────────────────────────────────

interface CampaignFormModalProps {
  open: boolean;
  editing: CampaignData | null;
  onClose: () => void;
  onSaved: (campaign: CampaignData, isNew: boolean) => void;
}

const CONTENT_FORMATS = [
  { id: "story", label: "Story", emoji: "⏱️" },
  { id: "post", label: "Post", emoji: "🖼️" },
  { id: "reel", label: "Reel", emoji: "🎬" },
  { id: "tiktok_video", label: "TikTok Video", emoji: "🎵" },
  { id: "youtube_video", label: "YouTube Video", emoji: "▶️" },
  { id: "storytelling", label: "Storytelling", emoji: "📖" },
  { id: "live", label: "Live Stream", emoji: "🔴" },
  { id: "ugc", label: "UGC", emoji: "📱" },
];

interface FormState {
  title: string;
  description: string;
  budget: string;
  status: string;
  deadline: Date | undefined;
  imageUrl: string | null;
  platforms: string[];
  contentFormats: string[];
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  budget: "",
  status: "DRAFT",
  deadline: undefined,
  imageUrl: null,
  platforms: [],
  contentFormats: [],
};

function CampaignFormModal({ open, editing, onClose, onSaved }: CampaignFormModalProps) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          title: editing.title,
          description: editing.description,
          budget: editing.budget.toString(),
          status: editing.status,
          deadline: editing.deadline ? new Date(editing.deadline) : undefined,
          imageUrl: editing.imageUrl ?? null,
          platforms: editing.platforms ?? [],
          contentFormats: editing.contentFormats ?? [],
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, editing]);

  const patch = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const budget = parseFloat(form.budget);
    if (!form.title.trim() || !form.description.trim() || isNaN(budget) || budget <= 0) {
      toast.error("Please fill in all required fields correctly.");
      return;
    }

    startTransition(async () => {
      const payload = {
        title: form.title,
        description: form.description,
        budget,
        status: form.status,
        deadline: form.deadline ? form.deadline.toISOString() : null,
        imageUrl: form.imageUrl,
        platforms: form.platforms,
        contentFormats: form.contentFormats,
      };

      const result = editing
        ? await updateCampaignAction(editing.id, payload)
        : await createCampaignAction(payload);

      if (result.error || !result.data) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(editing ? "Campaign updated!" : "Campaign created!");
      onSaved(result.data, !editing);
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            {editing ? "Edit Campaign" : "New Campaign"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-1">
          {/* Image Upload */}
          <ImageUploadField
            value={form.imageUrl}
            onChange={(url) => patch("imageUrl", url)}
          />

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title *</label>
            <Input
              value={form.title}
              onChange={(e) => patch("title", e.target.value)}
              placeholder="e.g. Summer Brand Awareness"
              maxLength={120}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description *</label>
            <textarea
              value={form.description}
              onChange={(e) => patch("description", e.target.value)}
              placeholder="Describe the campaign goals, requirements, and deliverables…"
              rows={3}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Budget + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Budget (USD) *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={1}
                  step={0.01}
                  value={form.budget}
                  onChange={(e) => patch("budget", e.target.value)}
                  placeholder="5000"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={(v) => patch("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="PAUSED">Paused</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Modern Date Picker */}
          <DatePicker
            value={form.deadline}
            onChange={(d) => patch("deadline", d)}
          />

          {/* Platform Selector */}
          <PlatformSelector
            value={form.platforms}
            onChange={(p) => patch("platforms", p)}
          />

          {/* Content Formats */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Content Formats</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CONTENT_FORMATS.map((cf) => {
                const selected = form.contentFormats.includes(cf.id);
                return (
                  <button
                    key={cf.id}
                    type="button"
                    onClick={() =>
                      patch(
                        "contentFormats",
                        selected
                          ? form.contentFormats.filter((x) => x !== cf.id)
                          : [...form.contentFormats, cf.id],
                      )
                    }
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all text-left",
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-zinc-200 dark:border-zinc-700 text-muted-foreground hover:border-zinc-300 dark:hover:border-zinc-600",
                    )}
                  >
                    <span className="text-base leading-none">{cf.emoji}</span>
                    <span className="truncate">{cf.label}</span>
                    {selected && (
                      <span className="ml-auto w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="pt-1 flex flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </span>
              ) : editing ? "Save Changes" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Connections Panel ─────────────────────────────────────────────────────────

interface ConnectionsPanelProps {
  open: boolean;
  campaignTitle: string;
  creators: ConnectedCreator[];
  loading: boolean;
  onClose: () => void;
}

function ConnectionsPanel({ open, campaignTitle, creators, loading, onClose }: ConnectionsPanelProps) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-zinc-900/95 backdrop-blur-xl border-l border-white/[0.07] flex flex-col shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="font-bold text-base text-zinc-100">Eligible Creators</h2>
            <p className="text-xs text-zinc-500 truncate max-w-[200px]">{campaignTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/[0.06] transition-colors text-zinc-500 hover:text-zinc-200"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : creators.length === 0 ? (
            <div className="flex flex-col items-center py-16 px-6 text-center">
              <Users className="w-10 h-10 text-zinc-700 mb-3" strokeWidth={1.5} />
              <p className="font-semibold text-sm mb-1 text-zinc-300">No connected creators</p>
              <p className="text-xs text-zinc-500">
                Connect with creators in the Discover tab to see them here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {creators.map((creator) => {
                const initials = creator.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <li key={creator.userId} className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.04] transition-colors">
                    <div className="w-10 h-10 rounded-2xl overflow-hidden shrink-0">
                      {creator.avatarUrl ? (
                        <img src={creator.avatarUrl} alt={creator.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate text-zinc-100">{creator.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {creator.primaryPlatform && (
                          <span className="text-xs text-zinc-400">
                            {getPlatformMeta(creator.primaryPlatform)?.emoji ?? "🌐"}{" "}
                            {creator.primaryPlatform}
                          </span>
                        )}
                        {creator.niche && (
                          <span className="text-xs text-zinc-500 truncate">
                            · {creator.niche}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {formatFollowers(creator.totalFollowers)} followers
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/[0.06] shrink-0">
          <p className="text-xs text-zinc-600 text-center">
            {creators.length} connected creator{creators.length !== 1 ? "s" : ""} available
          </p>
        </div>
      </aside>
    </>
  );
}

// ── Campaign Card ─────────────────────────────────────────────────────────────

interface CampaignCardProps {
  campaign: CampaignData;
  onEdit: (c: CampaignData) => void;
  onDelete: (id: string) => void;
  onViewConnections: (c: CampaignData) => void;
  deleting: boolean;
}

function CampaignCard({ campaign, onEdit, onDelete, onViewConnections, deleting }: CampaignCardProps) {
  const meta = STATUS_META[campaign.status] ?? STATUS_META.DRAFT;
  const StatusIcon = meta.icon;
  const deadline = formatDeadline(campaign.deadline);
  const remaining = timeUntilDeadline(campaign.deadline);
  const isOverdue = remaining === "Overdue";

  return (
    <article className="group relative bg-white/[0.03] backdrop-blur-xl border border-white/[0.07] rounded-3xl overflow-hidden hover:border-white/[0.14] hover:shadow-xl hover:shadow-black/20 transition-all duration-200">
      {/* Campaign image */}
      {campaign.imageUrl && (
        <div className="w-full h-32 overflow-hidden">
          <img
            src={campaign.imageUrl}
            alt={campaign.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}

      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={cn("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold", meta.color)}>
                <StatusIcon className="w-3 h-3" strokeWidth={1.5} />
                {meta.label}
              </span>
              {campaign.proposalCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/15">
                  <FileText className="w-3 h-3" strokeWidth={1.5} />
                  {campaign.proposalCount} application{campaign.proposalCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <h3 className="font-bold text-base leading-snug line-clamp-2 text-zinc-100 group-hover:text-violet-400 transition-colors">
              {campaign.title}
            </h3>
          </div>

          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(campaign)}
              className="p-1.5 rounded-xl hover:bg-white/[0.07] text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Edit"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => onDelete(campaign.id)}
              disabled={deleting}
              className="p-1.5 rounded-xl hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-zinc-500 line-clamp-2 mb-3">
          {campaign.description}
        </p>

        {/* Platform chips */}
        {campaign.platforms.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {campaign.platforms.slice(0, 4).map((pid) => {
              const pm = getPlatformMeta(pid);
              return (
                <span
                  key={pid}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.05] text-zinc-400 border border-white/[0.07]"
                >
                  {pm?.emoji ?? "🌐"} {pm?.label ?? pid}
                </span>
              );
            })}
            {campaign.platforms.length > 4 && (
              <span className="text-xs text-zinc-600">+{campaign.platforms.length - 4}</span>
            )}
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-4 flex-wrap text-sm mb-4">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <DollarSign className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
            {formatBudget(campaign.budget)}
          </div>
          {deadline && (
            <div className={cn("flex items-center gap-1.5", isOverdue ? "text-red-400" : "text-zinc-500")}>
              <Clock className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-xs">{deadline}</span>
              {remaining && (
                <span className={cn("text-xs font-medium", isOverdue ? "text-red-400" : "text-amber-400")}>
                  ({remaining})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer CTAs */}
        <div className="flex gap-2">
          <Link
            href={`/brand/campaigns/${campaign.id}`}
            className="flex-1 flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] hover:border-violet-500/25 transition-all group/btn"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-500 group-hover/btn:text-zinc-200 transition-colors">
              <Users className="w-4 h-4" strokeWidth={1.5} />
              {campaign.proposalCount > 0
                ? `${campaign.proposalCount} applicant${campaign.proposalCount !== 1 ? "s" : ""}`
                : "View applicants"}
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover/btn:text-violet-400 transition-colors" strokeWidth={1.5} />
          </Link>
          <button
            onClick={() => onViewConnections(campaign)}
            title="View connected creators"
            className="px-3 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] hover:border-violet-500/25 transition-all text-zinc-500 hover:text-zinc-200"
          >
            <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const Campaigns = () => {
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignData | null>(null);

  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignData | null>(null);
  const [connectedCreators, setConnectedCreators] = useState<ConnectedCreator[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getBrandCampaignsAction();
    if (!result.error) setCampaigns(result.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (campaign: CampaignData, isNew: boolean) => {
    if (isNew) {
      setCampaigns((prev) => [campaign, ...prev]);
    } else {
      setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? campaign : c)));
    }
  };

  const handleEdit = (campaign: CampaignData) => {
    setEditingCampaign(campaign);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    const id = confirmDeleteId;
    if (!id) return;
    setConfirmDeleteId(null);
    setDeletingId(id);
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    const result = await deleteCampaignAction(id);
    if (result.error) {
      toast.error(result.error);
      load();
    } else {
      toast.success("Campaign deleted.");
    }
    setDeletingId(null);
  };

  const handleViewConnections = async (campaign: CampaignData) => {
    setSelectedCampaign(campaign);
    setConnectionsOpen(true);
    setConnectionsLoading(true);
    const result = await getCampaignConnectionsAction();
    if (!result.error) setConnectedCreators(result.data);
    setConnectionsLoading(false);
  };

  const filtered = statusFilter === "ALL"
    ? campaigns
    : campaigns.filter((c) => c.status === statusFilter);

  const countByStatus = (s: string) =>
    s === "ALL" ? campaigns.length : campaigns.filter((c) => c.status === s).length;

  const counts = {
    total: campaigns.length,
    active: campaigns.filter((c) => c.status === "ACTIVE").length,
    draft: campaigns.filter((c) => c.status === "DRAFT").length,
    paused: campaigns.filter((c) => c.status === "PAUSED").length,
    completed: campaigns.filter((c) => c.status === "COMPLETED").length,
  };

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 text-zinc-100">
              <Megaphone className="w-7 h-7 text-violet-400" strokeWidth={1.5} />
              Campaigns
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Manage your brand campaigns and connect with creators.
            </p>
          </div>
          <Button
            onClick={() => { setEditingCampaign(null); setModalOpen(true); }}
            className="flex items-center gap-2 w-full sm:w-auto bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white border-0 rounded-2xl shadow-lg shadow-violet-500/20"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            New Campaign
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total", value: counts.total, icon: Target, color: "text-zinc-100" },
            { label: "Active", value: counts.active, icon: TrendingUp, color: "text-emerald-400" },
            { label: "Draft", value: counts.draft, icon: Layers, color: "text-zinc-400" },
            { label: "Paused", value: counts.paused, icon: PauseCircle, color: "text-amber-400" },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.07] rounded-3xl p-3 sm:p-4 flex flex-col gap-1"
            >
              <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                <s.icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                {s.label}
              </div>
              <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
          {[
            { value: "ALL", label: "All" },
            { value: "ACTIVE", label: "Active" },
            { value: "DRAFT", label: "Draft" },
            { value: "PAUSED", label: "Paused" },
            { value: "COMPLETED", label: "Completed" },
            { value: "CANCELLED", label: "Cancelled" },
          ].map((tab) => {
            const count = countByStatus(tab.value);
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border",
                  statusFilter === tab.value
                    ? "bg-gradient-to-r from-violet-600/80 to-purple-600/80 text-white border-violet-500/30 shadow-sm shadow-violet-500/20"
                    : "bg-white/[0.04] text-zinc-400 border-white/[0.07] hover:border-white/[0.14] hover:text-zinc-200",
                )}
              >
                {tab.label}
                {!loading && count > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
                      statusFilter === tab.value
                        ? "bg-white/20 text-white"
                        : "bg-white/[0.06] text-zinc-500",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Campaign grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-3xl overflow-hidden animate-pulse">
                <div className="h-32 bg-zinc-800/60" />
                <div className="p-5">
                  <div className="h-4 bg-zinc-800 rounded w-20 mb-3" />
                  <div className="h-5 bg-zinc-800 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-zinc-800/70 rounded w-full mb-4" />
                  <div className="h-10 bg-zinc-800/40 rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          statusFilter !== "ALL" ? (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="w-14 h-14 rounded-3xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-4">
                <Megaphone className="w-6 h-6 text-zinc-500" strokeWidth={1.5} />
              </div>
              <p className="font-semibold text-sm mb-1 text-zinc-300">
                No {statusFilter.toLowerCase()} campaigns
              </p>
              <p className="text-xs text-zinc-500 mb-4">
                Switch the filter to see other campaigns.
              </p>
              <Button variant="outline" size="sm" onClick={() => setStatusFilter("ALL")} className="border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] rounded-xl">
                <X className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                Show all
              </Button>
            </div>
          ) : (
            <RichEmptyState
              icon={<Megaphone className="w-8 h-8 text-violet-500 dark:text-violet-400" />}
              headline="No campaigns yet"
              sub="Create your first campaign to start connecting with creators and tracking your influencer partnerships."
              primary={{
                label: "Create Campaign",
                onClick: () => { setEditingCampaign(null); setModalOpen(true); },
                icon: <Plus className="w-4 h-4" />,
              }}
              tips={[
                { icon: <Target className="w-3 h-3" />, label: "Set budget & platform" },
                { icon: <Users className="w-3 h-3" />, label: "Reach verified creators" },
                { icon: <CheckCircle2 className="w-3 h-3" />, label: "Track collaborations" },
              ]}
            />
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onViewConnections={handleViewConnections}
                deleting={deletingId === campaign.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <CampaignFormModal
        open={modalOpen}
        editing={editingCampaign}
        onClose={() => { setModalOpen(false); setEditingCampaign(null); }}
        onSaved={handleSaved}
      />

      {/* Connections Panel */}
      <ConnectionsPanel
        open={connectionsOpen}
        campaignTitle={selectedCampaign?.title ?? ""}
        creators={connectedCreators}
        loading={connectionsLoading}
        onClose={() => { setConnectionsOpen(false); setSelectedCampaign(null); }}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the campaign and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-600"
            >
              Delete Campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default Campaigns;
