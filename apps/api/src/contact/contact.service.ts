import { Inject, Injectable } from "@nestjs/common";
import type { ContactInput } from "@omini/shared";
import { ApiError } from "../api-error";
import { ContactRepository } from "./contact.repository";
const unavailable = () =>
  new ApiError(
    404,
    "CONTACT_UNAVAILABLE",
    "Contato indisponível para esta solicitação.",
  );
@Injectable()
export class ContactService {
  constructor(
    @Inject(ContactRepository) private readonly repository: ContactRepository,
  ) {}
  private async run<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(
        503,
        "CONTACT_UNAVAILABLE",
        "Não foi possível consultar ou atualizar o contato. Tente novamente.",
      );
    }
  }
  own(id: string) {
    return this.run(async () => {
      const row = await this.repository.own(id);
      if (!row) throw unavailable();
      return row;
    });
  }
  update(id: string, input: ContactInput) {
    return this.run(async () => {
      const row = await this.repository.update(id, input);
      if (!row) throw unavailable();
      return row;
    });
  }
  request(userId: string, id: string) {
    return this.run(async () => {
      const row = await this.repository.request(id);
      if (
        !row ||
        row.providerUserId.toLowerCase() !== userId.toLowerCase() ||
        !row.providerActive ||
        !["ACCEPTED", "IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(
          row.status,
        ) ||
        !row.contact
      )
        throw unavailable();
      return row.contact;
    });
  }
}
