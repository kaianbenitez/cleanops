"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewEmployeePage() {
  const router = useRouter();

  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [birthday, setBirthday] = useState("");
  const [hiredDate, setHiredDate] = useState("");
  const [payType, setPayType] = useState<"commission_jth" | "office_hourly">("commission_jth");
  const [hourlyRate, setHourlyRate] = useState("0");
  const [gustoEmployeeId, setGustoEmployeeId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tempPassword: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName || !lastName || !email) {
      setError("First name, last name, and email are required.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        firstName,
        lastName,
        email,
        phone: phone || undefined,
        title: title || undefined,
        birthday: birthday || undefined,
        hiredDate: hiredDate || undefined,
        payType: role === "employee" ? payType : undefined,
        hourlyRateCents: role === "employee" ? Math.round(parseFloat(hourlyRate || "0") * 100) : undefined,
        gustoEmployeeId: role === "employee" ? gustoEmployeeId || undefined : undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ? JSON.stringify(body.error) : "Failed to create employee.");
      setSubmitting(false);
      return;
    }

    const data = await res.json();
    setResult({ tempPassword: data.tempPassword });
    setSubmitting(false);
  }

  if (result) {
    return (
      <div className="max-w-md space-y-4">
        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <h1 className="text-lg font-semibold">{role === "admin" ? "Admin" : "Employee"} created</h1>
          <p className="text-sm text-gray-600">
            Share these login details with {firstName} directly (not over an unsecured channel):
          </p>
          <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
            <div>
              <span className="text-gray-500">Email:</span> {email}
            </div>
            <div>
              <span className="text-gray-500">Temporary password:</span>{" "}
              <span className="font-mono">{result.tempPassword}</span>
            </div>
          </div>
          <p className="text-xs text-amber-600">
            This password is shown once and not stored anywhere retrievable — copy it now.
          </p>
          <button
            onClick={() => router.push(role === "admin" ? "/settings" : "/employees")}
            className="w-full rounded bg-gray-900 text-white text-sm font-medium py-2"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-lg font-semibold">{role === "admin" ? "New Admin" : "New Employee"}</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Account type</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="employee">Employee (cleaner)</option>
            <option value="admin">Admin (full access)</option>
          </select>
          {role === "admin" && (
            <p className="mt-1 text-xs text-gray-500">
              Admins get full access to customers, quotes, scheduling, and payroll — no pay/title fields needed.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">First name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Last name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {role === "employee" && (
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cleaning Tech (Primary)"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Birthday</label>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Hired date</label>
            <input
              type="date"
              value={hiredDate}
              onChange={(e) => setHiredDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {role === "employee" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Pay type</label>
                <select
                  value={payType}
                  onChange={(e) => setPayType(e.target.value as typeof payType)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="commission_jth">Commission (Job Ticket Hours)</option>
                  <option value="office_hourly">Office Hourly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {payType === "commission_jth" ? "Fallback rate ($/hr)" : "Hourly rate ($/hr)"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Gusto employee ID (optional)</label>
              <input
                value={gustoEmployeeId}
                onChange={(e) => setGustoEmployeeId(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-gray-900 text-white text-sm font-medium py-2 disabled:opacity-50"
        >
          {submitting ? "Creating..." : role === "admin" ? "Create Admin" : "Create Employee"}
        </button>
      </form>
    </div>
  );
}
