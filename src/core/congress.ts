export function congressNumber(date: string): number | null {
  const parsed = new Date(date);
  const year = parsed.getUTCFullYear();
  // Modern Congresses begin on January 3 of odd-numbered years.
  const beforeOpening = parsed.getUTCMonth() === 0 && parsed.getUTCDate() < 3;
  const congress = Math.floor((year - Number(beforeOpening) - 1789) / 2) + 1;
  return Number.isFinite(congress) && congress >= 1 ? congress : null;
}

export function congressLabel(date: string | number): string {
  const congress = typeof date === "number" ? date : congressNumber(date);
  if (congress === null) return "Other dates";
  const suffix = [11, 12, 13].includes(congress % 100)
    ? "th"
    : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[
        congress % 10
      ] ?? "th");
  return `${congress}${suffix} Congress`;
}
