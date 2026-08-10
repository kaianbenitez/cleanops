"use client";

import { useState } from "react";
import AppointmentPanel from "./appointment-panel";

type StaffMember = { id: string; firstName: string; lastName: string };

export default function NewAppointmentButton({ staffRoster, defaultDate }: { staffRoster: StaffMember[]; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="co-button-secondary">
        + New appointment
      </button>
      {open ? <AppointmentPanel mode="create" staffRoster={staffRoster} defaultDate={defaultDate} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
