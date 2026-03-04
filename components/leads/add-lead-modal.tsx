"use client";

import { X } from "lucide-react";

type NewLeadForm = {
  businessName: string;
  phone: string;
  website: string;
};

type AddLeadModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  formData: NewLeadForm;
  errorMessage?: string | null;
  onChange: (field: keyof NewLeadForm, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function AddLeadModal({ isOpen, isSubmitting, formData, errorMessage, onChange, onClose, onSubmit }: AddLeadModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Lead Pipeline</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-100">Add Lead</h2>
            <p className="mt-1 text-sm text-zinc-400">Manually add a lead and push it directly into your Supabase pipeline.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close add lead modal"
            className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">Business Name</span>
            <input
              value={formData.businessName}
              onChange={(event) => onChange("businessName", event.target.value)}
              placeholder="Acme Dental"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">Phone</span>
            <input
              value={formData.phone}
              onChange={(event) => onChange("phone", event.target.value)}
              placeholder="(555) 555-0100"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">Website</span>
            <input
              value={formData.website}
              onChange={(event) => onChange("website", event.target.value)}
              placeholder="https://acmedental.com"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-500"
            />
          </label>
        </div>

        {errorMessage ? <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{errorMessage}</p> : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || !formData.businessName.trim()}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
          >
            {isSubmitting ? "Adding lead..." : "Add Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
