import { z } from "zod";
import { hasPrivateRequestData } from "@omini/shared";
export const createReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z
      .string()
      .trim()
      .transform((v) => v.normalize("NFC"))
      .pipe(
        z
          .string()
          .max(1000)
          .refine(
            (v) =>
              !hasPrivateRequestData(v) &&
              !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
          ),
      )
      .nullish()
      .transform((v) => v || null),
  })
  .strict();
export const reviewQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict();
