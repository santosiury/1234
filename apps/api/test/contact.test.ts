import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBrazilMobile,
  formatBrazilMobile,
  contactLinks,
  CONTACT_MESSAGE,
  contactReady,
} from "@omini/shared";
import {
  registerSchema,
  contactSchema,
  parseInput,
} from "../src/auth/auth.validation";
import { ContactService } from "../src/contact/contact.service";
import {
  ContactRepository,
  type ContactRequestRecord,
} from "../src/contact/contact.repository";
import type { ContactInput, OwnContact } from "@omini/shared";
import { ApiError } from "../src/api-error";
const valid = {
  phone: "(48) 99876-5432",
  hasWhatsapp: true,
  shareContact: true,
};
const registration = {
  displayName: "Cliente Teste",
  email: "cliente@example.com",
  password: "password for test 25",
  profiles: ["client"],
};
test("Brazil mobile validates DDD and normalizes international/formatted national numbers", () => {
  for (const phone of [valid.phone, "+5548998765432", "5548998765432"])
    assert.equal(normalizeBrazilMobile(phone), "+5548998765432");
  for (const phone of [
    "4898765432",
    "+5530998765432",
    "48999999999",
    "https://wa.me/5548998765432",
    "++5548998765432",
    "",
  ])
    assert.equal(normalizeBrazilMobile(phone), null);
  assert.equal(formatBrazilMobile("+5548998765432"), valid.phone);
});
test("client registration requires mobile, WhatsApp choice and explicit consent; provider-only remains available", () => {
  assert.throws(() => parseInput(registerSchema, registration));
  assert.throws(() =>
    parseInput(registerSchema, {
      ...registration,
      contact: { ...valid, shareContact: false },
    }),
  );
  assert.throws(() =>
    parseInput(contactSchema, { ...valid, hasWhatsapp: undefined }),
  );
  assert.equal(
    parseInput(registerSchema, { ...registration, contact: valid }).contact
      ?.phone,
    "+5548998765432",
  );
  assert.ok(
    parseInput(registerSchema, { ...registration, profiles: ["provider"] }),
  );
});
class MemoryContact extends ContactRepository {
  value: OwnContact = { ...valid, phone: "+5548998765432", contactReady: true };
  row: ContactRequestRecord | null = {
    providerUserId: "owner",
    providerActive: true,
    status: "ACCEPTED",
    contact: { phone: "+5548998765432", hasWhatsapp: true },
  };
  async own(id: string) {
    return id === "client" ? this.value : null;
  }
  async update(id: string, input: ContactInput) {
    if (id !== "client") return null;
    this.value = { ...input, contactReady: input.shareContact };
    return this.value;
  }
  async request() {
    return this.row;
  }
}
test("private contact rejects third parties, inactive provider, missing consent and every closed/unaccepted status", async () => {
  const db = new MemoryContact(),
    service = new ContactService(db);
  assert.equal(
    (await service.request("owner", "request")).phone,
    "+5548998765432",
  );
  await assert.rejects(
    service.request("client", "request"),
    (e: ApiError) => e.code === "CONTACT_UNAVAILABLE",
  );
  await assert.rejects(service.request("stranger", "request"));
  for (const status of ["REQUESTED", "REJECTED", "CANCELLED", "COMPLETED"]) {
    db.row!.status = status;
    await assert.rejects(service.request("owner", "request"));
  }
  for (const status of ["ACCEPTED", "IN_PROGRESS", "AWAITING_CONFIRMATION"]) {
    db.row!.status = status;
    assert.ok(await service.request("owner", "request"));
  }
  db.row!.providerActive = false;
  await assert.rejects(service.request("owner", "request"));
  db.row!.providerActive = true;
  db.row!.contact = null;
  await assert.rejects(service.request("owner", "request"));
  db.row = null;
  await assert.rejects(service.request("owner", "request"));
});
test("legacy phone alone does not imply consent and owner can revoke without affecting credentials", async () => {
  assert.equal(
    contactReady({ phone: "+5548998765432", phoneShareConsentedAt: null }),
    false,
  );
  const db = new MemoryContact(),
    service = new ContactService(db);
  assert.equal(
    (await service.update("client", { ...valid, shareContact: false }))
      .contactReady,
    false,
  );
  await assert.rejects(service.own("other"));
  await assert.rejects(service.update("other", valid));
});
test("WhatsApp and telephone links are validated, generic and platform-independent; no automatic send", () => {
  const links = contactLinks(valid.phone)!;
  assert.equal(new URL(links.whatsapp).pathname, "/5548998765432");
  assert.equal(
    new URL(links.whatsapp).searchParams.get("text"),
    CONTACT_MESSAGE,
  );
  assert.equal(links.telephone, "tel:+5548998765432");
  assert.equal(contactLinks("javascript:alert(1)"), null);
  assert.equal(contactLinks("+1 555 123 4567"), null);
});
