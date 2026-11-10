import { Injectable, OnModuleInit } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
@Injectable()
export class PasswordService implements OnModuleInit {
  private dummy?: string;
  async onModuleInit() {
    this.dummy = await this.hash(randomBytes(32).toString("base64url"));
  }
  hash(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
    });
  }
  async verify(hash: string | undefined, password: string): Promise<boolean> {
    const actual =
      hash ??
      (this.dummy ??= await this.hash(randomBytes(32).toString("base64url")));
    try {
      const valid = await argon2.verify(actual, password);
      return hash !== undefined && valid;
    } catch {
      return false;
    }
  }
}
