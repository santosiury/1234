import { Inject, Injectable } from "@nestjs/common";
import {
  contactReady,
  normalizeBrazilMobile,
  type ContactInput,
} from "@omini/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../persistence/prisma.service";
import { ContactRepository } from "./contact.repository";
const fields = {
  phone: true,
  hasWhatsapp: true,
  phoneShareConsentedAt: true,
} as const;
function own(row: {
  phone: string | null;
  hasWhatsapp: boolean;
  phoneShareConsentedAt: Date | null;
}) {
  return {
    phone: row.phone ? normalizeBrazilMobile(row.phone) : null,
    hasWhatsapp: row.hasWhatsapp,
    shareContact: !!row.phoneShareConsentedAt,
    contactReady: contactReady(row),
  };
}
@Injectable()
export class PrismaContactRepository extends ContactRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }
  async own(userId: string) {
    const row = await this.prisma
      .orm()
      .user.findFirst({
        where: { id: userId, isActive: true },
        select: fields,
      });
    return row ? own(row) : null;
  }
  update(userId: string, input: ContactInput) {
    return this.prisma.orm().$transaction(
      async (tx) => {
        const row = await tx.user.findFirst({
          where: { id: userId, isActive: true },
          select: { id: true },
        });
        if (!row) return null;
        const now = (
          await tx.$queryRaw<{ now: Date }[]>`SELECT SYSUTCDATETIME() AS [now]`
        )[0].now;
        return own(
          await tx.user.update({
            where: { id: userId },
            data: {
              phone: input.phone,
              hasWhatsapp: input.hasWhatsapp,
              phoneShareConsentedAt: input.shareContact ? now : null,
            },
            select: fields,
          }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  request(id: string) {
    return this.prisma.orm().$transaction(
      async (tx) => {
        const row = await tx.serviceRequest.findUnique({
          where: { id },
          select: {
            providerUserId: true,
            status: true,
            provider: {
              select: {
                isActive: true,
                user: { select: { id: true, isActive: true } },
              },
            },
            client: { select: { ...fields, isActive: true } },
          },
        });
        if (!row) return null;
        return {
          providerUserId: row.providerUserId,
          providerActive:
            row.provider.isActive &&
            row.provider.user.isActive &&
            row.provider.user.id.toLowerCase() ===
              row.providerUserId.toLowerCase(),
          status: row.status,
          contact:
            row.client.isActive && contactReady(row.client)
              ? {
                  phone: normalizeBrazilMobile(row.client.phone!)!,
                  hasWhatsapp: row.client.hasWhatsapp,
                }
              : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
