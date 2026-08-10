import Image from "next/image";

export function PhoneFrame({
  alt,
  className = "",
  height,
  maxWidthClass = "max-w-[22rem]",
  priority = false,
  src,
  width,
}: {
  alt: string;
  className?: string;
  height: number;
  maxWidthClass?: string;
  priority?: boolean;
  src: string;
  width: number;
}) {
  return (
    <div className={`flex justify-center border border-[var(--co-line-soft)] bg-[var(--co-surface)] px-6 py-8 sm:px-10 sm:py-10 ${className}`}>
      <Image src={src} alt={alt} width={width} height={height} sizes="(min-width: 640px) 352px, 80vw" priority={priority} className={`h-auto w-full ${maxWidthClass} object-contain`} />
    </div>
  );
}
