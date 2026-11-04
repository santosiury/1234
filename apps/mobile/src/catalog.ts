import type { DemoProfessional } from "@omini/shared";
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function filterProfessionals(
  items: DemoProfessional[],
  query: string,
  category?: string,
) {
  const term = normalize(query.trim());
  return items.filter(
    (item) =>
      (!category || item.categoryId === category) &&
      normalize(`${item.name} ${item.specialty} ${item.neighborhood}`).includes(
        term,
      ),
  );
}
