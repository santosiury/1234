import { z } from "zod";
import { ApiError } from "../api-error";
const email = z
  .string()
  .trim()
  .max(254)
  .email()
  .regex(/^[\x21-\x7e]+$/)
  .transform((value) => value.toLowerCase());
export const roleSchema = z.enum(["client", "provider"]);
export const profileSchema = z.object({ role: roleSchema }).strict();
export const passwordSchema = z.string().min(12).max(128).regex(/\S/);
export const registerSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    email,
    password: passwordSchema,
    profiles: z
      .array(roleSchema)
      .min(1)
      .max(2)
      .refine((roles) => new Set(roles).size === roles.length)
      .default(["client"]),
  })
  .strict();
export const loginSchema = z
  .object({ email, password: z.string().min(1).max(128) })
  .strict();
export const refreshSchema = z
  .object({ refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Confira os dados informados.",
      [
        ...new Set(
          result.error.issues.map((issue) => String(issue.path[0] ?? "form")),
        ),
      ],
    );
  return result.data;
}
