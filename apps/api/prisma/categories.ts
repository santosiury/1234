export const initialCategories = [
  { slug: "eletrica", name: "Eletricista" },
  { slug: "hidraulica", name: "Encanador" },
  { slug: "alvenaria", name: "Pedreiro" },
  { slug: "pintura", name: "Pintor" },
  { slug: "limpeza", name: "Diarista" },
  { slug: "montagem", name: "Montador de móveis" },
  { slug: "informatica", name: "Técnico de informática" },
  { slug: "climatizacao", name: "Instalador de ar-condicionado" },
] as const;
export interface CategorySeedStore {
  serviceCategory: {
    upsert(args: {
      where: { slug: string };
      update: Record<string, never>;
      create: { slug: string; name: string; sortOrder: number };
    }): Promise<unknown>;
  };
}
export async function seedCategories(store: CategorySeedStore): Promise<void> {
  for (const [sortOrder, category] of initialCategories.entries()) {
    await store.serviceCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: { ...category, sortOrder },
    });
  }
}
