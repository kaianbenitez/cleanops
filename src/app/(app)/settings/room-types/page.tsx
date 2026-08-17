"use client";

import { useEffect, useRef, useState } from "react";

type Weight = { serviceType: string; weightHours: string };
type RoomType = { id: string; name: string; sortOrder: number; weights: Weight[] };

const SERVICE_TYPES = [
  { value: "supreme_deep", label: "Supreme Deep" },
  { value: "deep", label: "Deep" },
  { value: "first_time", label: "First Time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "four_weeks", label: "4 Weeks" },
  { value: "move_in_out", label: "Move In/Out" },
] as const;

const MAX_WEIGHT_HOURS = 24;
const RELOAD_DEBOUNCE_MS = 400;

export default function RoomTypesSettingsPage() {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const pendingWeightSaves = useRef(new Set<string>());
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/room-types").then((response) => response.json());
    setRoomTypes(data.roomTypes ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load server-backed settings on mount
    load();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, []);

  // Tabbing through a whole row fires one PATCH per cell (each targets a
  // different serviceType, so those can't be merged) — but this coalesces
  // the trailing full-list reload into one call after the burst settles,
  // instead of reloading after every single field.
  function scheduleReload() {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      load();
    }, RELOAD_DEBOUNCE_MS);
  }

  async function renameRoomType(id: string, name: string) {
    const response = await fetch(`/api/room-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setMessage(response.ok ? "Room type saved." : "Could not save room type.");
    await load();
  }

  async function saveWeight(
    roomTypeId: string,
    serviceType: string,
    rawHours: string,
    previousHours: string,
    input: HTMLInputElement
  ) {
    const hours = Number(rawHours);
    if (!Number.isFinite(hours) || hours < 0 || hours > MAX_WEIGHT_HOURS) {
      setMessage(`Enter an hours value between 0 and ${MAX_WEIGHT_HOURS}.`);
      input.value = previousHours;
      return;
    }

    const key = `${roomTypeId}:${serviceType}`;
    if (pendingWeightSaves.current.has(key)) return;
    pendingWeightSaves.current.add(key);
    try {
      const response = await fetch(`/api/room-types/${roomTypeId}/weights`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceType, weightHours: hours }),
      });
      setMessage(response.ok ? "Pricing weight saved." : "Could not save weight.");
      if (response.ok) scheduleReload();
    } finally {
      pendingWeightSaves.current.delete(key);
    }
  }

  async function addRoomType() {
    if (!newName.trim()) return;
    const response = await fetch("/api/room-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, sortOrder: roomTypes.length }),
    });
    if (!response.ok) {
      setMessage("Could not add room type.");
      return;
    }
    setNewName("");
    setMessage("Room type added.");
    await load();
  }

  async function deleteRoomType(id: string) {
    const response = await fetch(`/api/room-types/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setMessage(body.error ?? "Could not remove room type.");
      return;
    }
    setMessage("Room type removed.");
    await load();
  }

  if (loading) {
    return <div className="co-card p-8 text-sm text-[var(--co-muted)]">Loading room types…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Pricing & quoting</p>
        <h1 className="page-title mt-2">Room types</h1>
        <p className="page-subtitle">
          Set the hours-per-room values that drive every calculated quote tier.
        </p>
      </div>

      <section className="co-card overflow-hidden">
        <div className="border-b border-[var(--co-line-soft)] px-5 py-4">
          <p className="eyebrow">Calculation matrix</p>
          <h2 className="mt-1 text-lg font-semibold">Hours per room</h2>
          <p className="mt-1 text-xs text-[var(--co-muted)]">Edit a value and leave the field to save it.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-[var(--co-accent-fill)] text-xs uppercase tracking-[0.08em] text-white">
              <tr>
                <th className="px-4 py-3">Room type</th>
                {SERVICE_TYPES.map((service) => (
                  <th key={service.value} className="px-3 py-3 text-right">
                    {service.label}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--co-line-soft)]">
              {roomTypes.map((room) => (
                <tr key={room.id} className="hover:bg-[var(--co-surface-muted)]/50">
                  <td className="px-4 py-3">
                    <input
                      defaultValue={room.name}
                      onBlur={(event) =>
                        event.target.value !== room.name && renameRoomType(room.id, event.target.value)
                      }
                      className="co-input w-44 font-medium"
                    />
                  </td>
                  {SERVICE_TYPES.map((service) => {
                    const weight = room.weights.find((entry) => entry.serviceType === service.value);
                    const weightHours = weight?.weightHours ?? "0";
                    return (
                      <td key={service.value} className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          max={MAX_WEIGHT_HOURS}
                          step="0.001"
                          defaultValue={weightHours}
                          onBlur={(event) =>
                            saveWeight(room.id, service.value, event.target.value, weightHours, event.target)
                          }
                          className="co-input w-24 text-right"
                        />
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteRoomType(room.id)}
                      className="text-xs font-medium text-rose-600 hover:text-rose-800"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {roomTypes.length === 0 && (
                <tr>
                  <td
                    colSpan={SERVICE_TYPES.length + 2}
                    className="px-4 py-12 text-center text-sm text-[var(--co-muted)]"
                  >
                    No room types yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="co-card p-5">
        <p className="eyebrow">Add room type</p>
        <h2 className="mt-1 text-lg font-semibold">Expand the home profile</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <input
            className="co-input min-w-[260px] flex-1"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Sunroom, gym, playroom…"
          />
          <button onClick={addRoomType} className="co-button-primary">
            Add room type
          </button>
        </div>
        {message && <p className="mt-3 text-sm font-medium text-[var(--co-accent-text)]">{message}</p>}
      </section>
    </div>
  );
}
