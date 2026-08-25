"use client";

import { useRouter } from "next/navigation";

export function PageSizeSelect({
  value,
  options,
  basePath,
  params,
}: {
  value: number;
  options: readonly number[];
  basePath: string;
  params: Record<string, string>;
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2">
      Page size
      <select
        aria-label="Page size"
        value={value}
        onChange={(event) => {
          const next = new URLSearchParams(params);
          next.set("pageSize", event.target.value);
          const query = next.toString();
          router.push(query ? `${basePath}?${query}` : basePath);
        }}
        className="co-input h-8 w-auto rounded-md py-0 pl-2 pr-7 text-xs"
      >
        {options.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}
