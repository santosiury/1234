import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthUser, ExperienceMode, RegisterInput } from "@omini/shared";
import { PrismaService } from "../persistence/prisma.service";
import { AuthRepository, SESSION_LIFETIME_MS } from "./auth.repository";
const profiles = { clientProfile: true, providerProfile: true } as const;
type DbUser = Prisma.UserGetPayload<{ include: typeof profiles }>;
export function publicUser(user: DbUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    profiles: {
      client: user.clientProfile?.isActive === true,
      provider: user.providerProfile?.isActive === true,
    },
  };
}
@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }
  private get db() {
    return this.prisma.orm();
  }
  async register(input: RegisterInput, passwordHash: string) {
    try {
      await this.db.$transaction(async (tx) => {
        // Preserve existing accounts, including historical users without credentials.
        const existing = await tx.$queryRaw<
          { id: string }[]
        >`SELECT TOP (1) [id] FROM [dbo].[User] WHERE LOWER(LTRIM(RTRIM([email]))) = ${input.email}`;
        if (existing.length) return;
        await tx.user.create({
          data: {
            email: input.email,
            displayName: input.displayName,
            authCredential: {
              create: { emailNormalized: input.email, passwordHash },
            },
            ...(input.profiles.includes("client")
              ? { clientProfile: { create: {} } }
              : {}),
            ...(input.profiles.includes("provider")
              ? {
                  providerProfile: {
                    create: { professionalName: input.displayName },
                  },
                }
              : {}),
          },
        });
      });
    } catch (error) {
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ))
        throw error;
    }
  }
  async credential(email: string) {
    const credential = await this.db.authCredential.findUnique({
      where: { emailNormalized: email },
      include: { user: { include: profiles } },
    });
    return credential
      ? {
          user: publicUser(credential.user),
          passwordHash: credential.passwordHash,
          active: credential.user.isActive,
        }
      : null;
  }
  async createSession(userId: string, hash: string, now: Date) {
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
    const row = await this.db.authSession.create({
      data: {
        userId,
        expiresAt,
        tokens: { create: { tokenHash: hash, expiresAt } },
      },
      include: { user: { include: profiles } },
    });
    return { id: row.id, expiresAt: row.expiresAt, user: publicUser(row.user) };
  }
  async session(id: string, userId: string, now: Date) {
    const row = await this.db.authSession.findFirst({
      where: {
        id,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { isActive: true },
      },
      include: { user: { include: profiles } },
    });
    return row ? publicUser(row.user) : null;
  }
  async rotate(hash: string, nextHash: string, now: Date) {
    return this.db.$transaction(
      async (tx) => {
        const token = await tx.refreshToken.findUnique({
          where: { tokenHash: hash },
          include: { session: { include: { user: { include: profiles } } } },
        });
        if (
          !token ||
          token.expiresAt <= now ||
          token.session.expiresAt <= now ||
          token.session.revokedAt ||
          !token.session.user.isActive
        )
          return null;
        if (token.consumedAt) {
          await tx.authSession.update({
            where: { id: token.sessionId },
            data: { revokedAt: now },
          });
          return null;
        }
        const consumed = await tx.refreshToken.updateMany({
          where: { id: token.id, consumedAt: null },
          data: { consumedAt: now },
        });
        // Atomic compare-and-set: simultaneous use cannot create two successor tokens.
        if (consumed.count !== 1) {
          await tx.authSession.update({
            where: { id: token.sessionId },
            data: { revokedAt: now },
          });
          return null;
        }
        await tx.refreshToken.create({
          data: {
            sessionId: token.sessionId,
            tokenHash: nextHash,
            expiresAt: token.session.expiresAt,
          },
        });
        return {
          id: token.sessionId,
          expiresAt: token.session.expiresAt,
          user: publicUser(token.session.user),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
  async revoke(hash: string, now: Date) {
    const token = await this.db.refreshToken.findUnique({
      where: { tokenHash: hash },
      select: { sessionId: true },
    });
    if (token)
      await this.db.authSession.updateMany({
        where: { id: token.sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
  }
  async addProfile(userId: string, role: ExperienceMode) {
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: profiles,
      });
      if (!user?.isActive) return null;
      const current =
        role === "client" ? user.clientProfile : user.providerProfile;
      if (current && !current.isActive) return null;
      if (role === "client")
        await tx.clientProfile.upsert({
          where: { userId },
          update: {},
          create: { userId },
        });
      else
        await tx.providerProfile.upsert({
          where: { userId },
          update: {},
          create: { userId, professionalName: user.displayName },
        });
      return publicUser(
        await tx.user.findUniqueOrThrow({
          where: { id: userId },
          include: profiles,
        }),
      );
    });
  }
}
