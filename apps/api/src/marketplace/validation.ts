import { z } from "zod";
export const idSchema = z.string().uuid();
const name = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .transform((v) => v.normalize("NFC"));
const description = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => v.normalize("NFC") || null)
  .nullable();
const state = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
  );
export const updateProviderSchema = z
  .object({
    professionalName: name(120).optional(),
    bio: description.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export const serviceSchema = z
  .object({
    categoryId: idSchema,
    title: name(120),
    description: description.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export const updateServiceSchema = serviceSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0);
const legacyAreaSchema = z
  .object({
    city: name(100),
    state,
    neighborhood: z
      .string()
      .trim()
      .max(100)
      .transform((v) => v.normalize("NFC"))
      .optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
function stripNeighborhood<T extends { neighborhood?: unknown }>(
  value: T,
): Omit<T, "neighborhood"> {
  const copy = { ...value };
  delete copy.neighborhood;
  return copy;
}
export const areaSchema = legacyAreaSchema.transform(stripNeighborhood);
export const updateAreaSchema = legacyAreaSchema
  .partial()
  .refine((v) => Object.keys(v).some((key) => key !== "neighborhood"))
  .transform(stripNeighborhood);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v.normalize("NFC") || undefined)
    .optional();
export const catalogQuerySchema = z
  .object({
    q: optionalText(80),
    categoryId: idSchema.optional(),
    city: optionalText(100),
    state: state.optional(),
    neighborhood: optionalText(100),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict()
  .transform(stripNeighborhood);
export type ParsedCatalogQuery = z.infer<typeof catalogQuerySchema>;
