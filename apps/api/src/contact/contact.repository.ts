import type { ContactInput, OwnContact, RequestContact } from "@omini/shared";
export interface ContactRequestRecord {
  providerUserId: string;
  providerActive: boolean;
  status: string;
  contact: RequestContact | null;
}
export abstract class ContactRepository {
  abstract own(userId: string): Promise<OwnContact | null>;
  abstract update(
    userId: string,
    input: ContactInput,
  ): Promise<OwnContact | null>;
  abstract request(id: string): Promise<ContactRequestRecord | null>;
}
