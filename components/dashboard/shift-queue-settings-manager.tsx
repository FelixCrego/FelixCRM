"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Save, SlidersHorizontal, Target, Users } from "lucide-react";
import {
  getShiftQueueTargetCounts,
  getShiftQueueLaneLabel,
  SHIFT_QUEUE_LANES,
  SHIFT_QUEUE_PRESETS,
  type ShiftQueueLane,
  type ShiftQueueSettings,
} from "@/lib/shift-queue";

type AssignmentUser = {
  id: string;
  name: string;
  email?: string | null;
  role?: string;
};

type ShiftQueueSettingsResponse = {
  settings?: ShiftQueueSettings | null;
  error?: string;
};

function createDraftFromPreset(presetId?: string | null): ShiftQueueSettings {
  const preset = SHIFT_QUEUE_PRESETS.find((item) => item.id === presetId) ?? SHIFT_QUEUE_PRESETS[1] ?? SHIFT_QUEUE_PRESETS[0];
  return {
    minCallsPerShift: preset?.minCallsPerShift ?? 60,
    mix: preset?.mix ?? { FRESH: 55, FOLLOW_UP: 25, MONEY: 15, DEMO: 5 },
    presetId: preset?.id ?? null,
    updatedAt: null,
    updatedByUserId: null,
  };
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function totalMix(settings: ShiftQueueSettings) {
  return SHIFT_QUEUE_LANES.reduce((sum, lane) => sum + settings.mix[lane], 0);
}

export function ShiftQueueSettingsManager() {
  const [users, setUsers] = useState<AssignmentUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [draftSettings, setDraftSettings] = useState<ShiftQueueSettings>(() => createDraftFromPreset("balanced-pipeline"));
  const [currentSettings, setCurrentSettings] = useState<ShiftQueueSettings | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [canManage, setCanManage] = useState(true);
  const [message, setMessage] = useState<string>("");
  const [messageTone, setMessageTone] = useState<"neutral" | "success" | "error">("neutral");

  useEffect(() => {
    let active = true;

    async function loadUsers() {
      setIsLoadingUsers(true);
      try {
        const response = await fetch("/api/users/reps", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { users?: AssignmentUser[]; error?: string } | null;

        if (!active) return;

        if (!response.ok || !Array.isArray(payload?.users)) {
          setCanManage(false);
          setUsers([]);
          setMessage(payload?.error ?? "Manager-only controls are unavailable.");
          setMessageTone("neutral");
          return;
        }

        const nextUsers = payload.users;
        setCanManage(true);
        setUsers(nextUsers);
        setSelectedUserId((current) => current || nextUsers[0]?.id || "");
        setMessage("");
      } catch {
        if (!active) return;
        setCanManage(false);
        setUsers([]);
        setMessage("Manager-only controls are unavailable.");
        setMessageTone("neutral");
      } finally {
        if (active) {
          setIsLoadingUsers(false);
        }
      }
    }

    void loadUsers();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!canManage || !selectedUserId) return;

    let active = true;

    async function loadSettings() {
      setIsLoadingSettings(true);
      try {
        const response = await fetch(`/api/shift-queue/settings?targetUserId=${encodeURIComponent(selectedUserId)}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as ShiftQueueSettingsResponse | null;
        if (!active) return;

        const nextSettings = payload?.settings ?? null;
        setCurrentSettings(nextSettings);
        setDraftSettings(nextSettings ?? createDraftFromPreset("balanced-pipeline"));
      } catch {
        if (!active) return;
        setCurrentSettings(null);
        setDraftSettings(createDraftFromPreset("balanced-pipeline"));
      } finally {
        if (active) {
          setIsLoadingSettings(false);
        }
      }
    }

    void loadSettings();
    return () => {
      active = false;
    };
  }, [canManage, selectedUserId]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );
  const mixTotal = useMemo(() => totalMix(draftSettings), [draftSettings]);
  const targetCounts = useMemo(
    () => getShiftQueueTargetCounts(draftSettings.minCallsPerShift, draftSettings.mix),
    [draftSettings],
  );
  const canSave = Boolean(selectedUserId) && mixTotal === 100 && draftSettings.minCallsPerShift >= 10 && !isSaving;

  function handlePresetApply(presetId: string) {
    setDraftSettings(createDraftFromPreset(presetId));
    setMessage("");
  }

  function updateLane(lane: ShiftQueueLane, value: number) {
    setDraftSettings((current) => ({
      ...current,
      presetId: null,
      mix: {
        ...current.mix,
        [lane]: clampPercent(value),
      },
    }));
    setMessage("");
  }

  async function handleSave() {
    if (!canSave || !selectedUserId) return;

    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/shift-queue/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: selectedUserId,
          settings: draftSettings,
        }),
      });
      const payload = (await response.json().catch(() => null)) as ShiftQueueSettingsResponse | { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload && "error" in payload && typeof payload.error === "string" ? payload.error : "Unable to save queue settings.");
      }

      const savedSettings = payload && "settings" in payload ? payload.settings ?? null : null;
      setCurrentSettings(savedSettings);
      setDraftSettings(savedSettings ?? createDraftFromPreset("balanced-pipeline"));
      setMessage("Shift blueprint saved. The rep queue will follow it immediately.");
      setMessageTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save queue settings.");
      setMessageTone("error");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    if (!selectedUserId || isSaving) return;

    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/shift-queue/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: selectedUserId,
          clear: true,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to clear queue settings.");
      }

      const fallback = createDraftFromPreset("balanced-pipeline");
      setCurrentSettings(null);
      setDraftSettings(fallback);
      setMessage("Shift blueprint cleared. The rep queue is back on default queue ordering.");
      setMessageTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to clear queue settings.");
      setMessageTone("error");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoadingUsers) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-sm text-zinc-400">Loading shift queue controls...</p>
      </section>
    );
  }

  if (!canManage) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Shift Queue Coach</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Manager-only queue controls</h2>
        <p className="mt-2 text-sm text-zinc-400">{message || "Only managers and super admins can tune live queue targets."}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Shift Queue Coach</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Set the live calling blueprint per rep</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Lock a minimum call target and lane mix for each rep. Their Shift Queue will float under-target call types to the top,
            show live progress, and keep the next best dial obvious all shift long.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-700 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-300">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Selected Rep</p>
          <p className="mt-1 font-semibold text-white">{selectedUser?.name ?? "Pick a rep"}</p>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <label className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <Users className="h-4 w-4" />
                Rep / Queue Owner
              </span>
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email ? `${user.name} (${user.email})` : user.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <Target className="h-4 w-4" />
                Min Calls / Shift
              </span>
              <input
                type="number"
                min={10}
                max={250}
                value={draftSettings.minCallsPerShift}
                onChange={(event) =>
                  setDraftSettings((current) => ({
                    ...current,
                    minCallsPerShift: Math.min(250, Math.max(10, Number(event.target.value) || 10)),
                  }))
                }
                className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-lg font-semibold text-white outline-none"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              <SlidersHorizontal className="h-4 w-4" />
              Quick Presets
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {SHIFT_QUEUE_PRESETS.map((preset) => {
                const isActive = draftSettings.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetApply(preset.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? "border-sky-400/35 bg-sky-400/10 text-white"
                        : "border-zinc-800 bg-zinc-950/70 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <p className="text-sm font-semibold">{preset.label}</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">{preset.description}</p>
                    <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-zinc-500">{preset.minCallsPerShift} call shift</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Call Mix</p>
                <p className="mt-1 text-sm text-zinc-300">Set the share of the shift each queue lane should consume.</p>
              </div>
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                mixTotal === 100 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-100"
              }`}>
                {mixTotal}% total
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {SHIFT_QUEUE_LANES.map((lane) => (
                <label key={lane} className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">{getShiftQueueLaneLabel(lane)}</span>
                    <span className="text-xs text-zinc-500">{targetCounts[lane]} calls</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draftSettings.mix[lane]}
                    onChange={(event) => updateLane(lane, Number(event.target.value) || 0)}
                    className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-lg font-semibold text-white outline-none"
                  />
                  <p className="mt-2 text-xs text-zinc-500">Percent of the shift queue that should come from this lane.</p>
                </label>
              ))}
            </div>
            {mixTotal !== 100 ? <p className="mt-3 text-sm text-amber-200">Adjust the lane percentages so they total exactly 100%.</p> : null}
          </div>
        </div>

        <aside className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Queue Preview</p>
            <h3 className="mt-2 text-lg font-semibold text-white">How the rep will feel this live</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              The rep sees a call target, lane progress bars, and a live &quot;next push&quot; signal. Under-target lanes float upward automatically.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Target Breakdown</p>
            <div className="mt-4 space-y-3">
              {SHIFT_QUEUE_LANES.map((lane) => (
                <div key={lane} className="rounded-2xl border border-zinc-800 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{getShiftQueueLaneLabel(lane)}</p>
                    <p className="text-sm text-zinc-300">{draftSettings.mix[lane]}%</p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{targetCounts[lane]} target calls in the shift</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Live Effect</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-300">
              <li>Reps get a clear minimum call number for the shift.</li>
              <li>The queue pushes the most under-hit lane to the top automatically.</li>
              <li>Progress clears only after the lead is actually worked and dispositioned.</li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave || isLoadingSettings}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save Blueprint"}
            </button>
            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={isSaving || isLoadingSettings || !currentSettings}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Clear Override
            </button>
          </div>

          {isLoadingSettings ? <p className="text-sm text-zinc-400">Loading selected rep settings...</p> : null}
          {message ? (
            <p
              className={`rounded-2xl border px-4 py-3 text-sm ${
                messageTone === "success"
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                  : messageTone === "error"
                    ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
                    : "border-zinc-700 bg-zinc-950 text-zinc-300"
              }`}
            >
              {message}
            </p>
          ) : null}
          {currentSettings?.updatedAt ? (
            <p className="text-xs text-zinc-500">Last updated {new Date(currentSettings.updatedAt).toLocaleString()}</p>
          ) : (
            <p className="text-xs text-zinc-500">No live override saved for this rep yet.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
