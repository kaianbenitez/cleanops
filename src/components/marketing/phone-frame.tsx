import Image from "next/image";

export function PhoneFrame({
  alt,
  className = "",
  priority = false,
  src,
  maxWidthClass = "max-w-[19rem]",
}: {
  alt: string;
  className?: string;
  priority?: boolean;
  src: string;
  maxWidthClass?: string;
}) {
  return (
    <div className={`relative mx-auto w-full ${maxWidthClass} ${className}`}>
      <div className="relative rounded-[3rem] bg-gradient-to-b from-[#3a3a3f] to-[#0e0e10] p-[3px] shadow-[0_45px_90px_-35px_rgba(15,23,42,0.5)]">
        <div className="rounded-[2.85rem] bg-black p-[9px]">
          <div className="relative aspect-[9/19.5] overflow-hidden rounded-[2.35rem] bg-black">
            {/* Reserved status-bar strip so the Dynamic Island never sits on top of app content. */}
            <div aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-[7%] bg-black" />
            <div className="absolute inset-x-0 bottom-0 top-[7%] overflow-hidden">
              <Image src={src} alt={alt} fill sizes="(min-width: 640px) 320px, 80vw" priority={priority} className="object-cover object-top" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent" />
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[2%] z-20 h-[3%] w-[30%] -translate-x-1/2 rounded-full bg-black ring-1 ring-white/10" />
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute -left-[2px] top-[20%] h-[6%] w-[3px] rounded-l-sm bg-[#4a4a4f]" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-[2px] top-[28%] h-[9%] w-[3px] rounded-l-sm bg-[#4a4a4f]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-[2px] top-[24%] h-[11%] w-[3px] rounded-r-sm bg-[#4a4a4f]" />
      </div>
    </div>
  );
}
