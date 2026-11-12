import { z } from "zod";
import {
  REQUEST_ACTIONS,
  REQUEST_STATUSES,
  hasPrivateRequestData,
} from "@omini/shared";
export const requestIdSchema = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());
// This phase accepts only coarse location. Obvious private identifiers are rejected, never echoed.
const safeText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) =>
        !hasPrivateRequestData(v) &&
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
    );
export const createRequestSchema = z
  .object({
    providerId: requestIdSchema,
    providerServiceId: requestIdSchema,
    description: safeText(10, 1000),
    city: safeText(2, 100),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
      ),
    neighborhood: safeText(0, 100).default(""),
    idempotencyKey: requestIdSchema,
  })
  .strict();
export const actionSchema = z.enum(REQUEST_ACTIONS);
export const requestActionSchema = z
  .object({
    version: z.number().int().min(1).max(2147483646),
    idempotencyKey: requestIdSchema,
    reason: safeText(1, 500).optional(),
  })
  .strict();
export const requestQuerySchema = z
  .object({
    status: z.enum(REQUEST_STATUSES).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict();
export type ParsedRequestQuery = z.infer<typeof requestQuerySchema>;

export const requestHistoryQuerySchema = z
  .object({
    afterVersion: z.coerce.number().int().min(0).max(2147483646).default(0),
  })
  .strict();
