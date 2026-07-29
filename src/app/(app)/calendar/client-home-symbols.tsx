import { Bath, BedDouble, CircleSlash, DoorOpen, KeyRound, PawPrint } from "lucide-react";

type ClientHomeSymbolsProps = {
  roomCounts?: { name: string; count: number }[];
  gateCodeOrKeyNotes?: string | null;
  petNotes?: string | null;
  doNotClean?: string | null;
  showAll?: boolean;
  className?: string;
};

type Symbol =
  | { kind: "room"; room: { name: string; count: number }; label: string; tone: string }
  | { kind: "note"; icon: typeof KeyRound; label: string; tone: string };

function RoomIcon({ name }: { name: string }) {
  const normalized = name.toLowerCase();
  if (normalized.includes("bed")) return <BedDouble className="h-3.5 w-3.5" aria-hidden />;
  if (normalized.includes("bath")) return <Bath className="h-3.5 w-3.5" aria-hidden />;
  return <DoorOpen className="h-3.5 w-3.5" aria-hidden />;
}

/** Compact, text-backed property details for dispatchers. Titles expose full details on hover. */
export default function ClientHomeSymbols({
  roomCounts = [],
  gateCodeOrKeyNotes,
  petNotes,
  doNotClean,
  showAll = false,
  className = "",
}: ClientHomeSymbolsProps) {
  const symbols: Symbol[] = [
    ...roomCounts.slice(0, showAll ? undefined : 3).map((room) => ({ kind: "room" as const, room, label: `${room.count} ${room.name}`, tone: "text-[var(--co-evergreen)]" })),
    ...(gateCodeOrKeyNotes ? [{ kind: "note" as const, icon: KeyRound, label: `Access: ${gateCodeOrKeyNotes}`, tone: "text-amber-700" }] : []),
    ...(petNotes ? [{ kind: "note" as const, icon: PawPrint, label: `Pets: ${petNotes}`, tone: "text-[var(--co-muted)]" }] : []),
    ...(doNotClean ? [{ kind: "note" as const, icon: CircleSlash, label: `Don't clean: ${doNotClean}`, tone: "text-rose-700" }] : []),
  ];

  if (!symbols.length) return null;

  return (
    <span className={`flex shrink-0 items-center gap-1 ${className}`} aria-label={symbols.map((symbol) => symbol.label).join("; ")}>
      {symbols.map((symbol) => (
        symbol.kind === "room" ? (
          <span key={symbol.label} title={symbol.label} className={`flex items-center gap-0.5 ${symbol.tone}`}>
            <RoomIcon name={symbol.room.name} />
            <span className="text-[10px] font-bold">{symbol.room.count}</span>
          </span>
        ) : <NoteSymbol key={symbol.label} icon={symbol.icon} label={symbol.label} tone={symbol.tone} />
      ))}
    </span>
  );
}

function NoteSymbol({ icon: Icon, label, tone }: { icon: typeof KeyRound; label: string; tone: string }) {
  return <span title={label} className={tone}><Icon className="h-3.5 w-3.5" aria-hidden /></span>;
}
