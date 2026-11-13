/** Municipality coverage; no street, district or device location is used. */
export interface CityLocation {
  city: string;
  state: string;
}
export const BRAZIL_STATES =
  /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;
export function cityLocation(value: {
  city?: unknown;
  state?: unknown;
}): CityLocation | null {
  if (typeof value.city !== "string" || typeof value.state !== "string")
    return null;
  const city = value.city.trim().normalize("NFC"),
    state = value.state.trim().toUpperCase();
  return city.length >= 2 && city.length <= 100 && BRAZIL_STATES.test(state)
    ? { city, state }
    : null;
}
export const cityKey = (value: CityLocation) =>
  `${value.state.trim().toUpperCase()}:${value.city.trim().normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR")}`;
export function cityAreas(
  rows: readonly (CityLocation & { id: string; isActive: boolean })[],
) {
  const groups = new Map<
    string,
    CityLocation & { id: string; isActive: boolean }
  >();
  for (const row of [...rows].sort((a, b) =>
    a.id.toLowerCase().localeCompare(b.id.toLowerCase()),
  )) {
    const location = cityLocation(row);
    if (!location) continue;
    const key = cityKey(location),
      previous = groups.get(key);
    // Stable representative, and any active legacy row makes the municipality active.
    groups.set(
      key,
      previous
        ? { ...previous, isActive: previous.isActive || row.isActive }
        : { id: row.id, ...location, isActive: row.isActive },
    );
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.state.localeCompare(b.state) ||
      a.city.localeCompare(b.city, "pt-BR", { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}
