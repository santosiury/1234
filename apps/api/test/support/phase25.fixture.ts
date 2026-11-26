import {
  PROTECTED_REVIEW_POLICY,
  PROTECTED_REVIEW_POLICY_HEADER,
} from "@omini/shared";
import { MemoryProtectedReviewsRepository } from "./memory-protected-reviews.repository";
import { ProtectedReviewsRepository } from "../../src/reviews/protected-reviews.repository";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import type {
  AuthTokens,
  CreateRequestInput,
  RequestAction,
  RequestActionInput,
  ServiceRequestDetail,
} from "@omini/shared";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/configure-app";
import { AuthRepository } from "../../src/auth/auth.repository";
import { MarketplaceRepository } from "../../src/marketplace/marketplace.repository";
import { RequestsRepository } from "../../src/requests/requests.repository";
import { RequestsRateGuard } from "../../src/requests/requests-rate.guard";
import { ContactRepository } from "../../src/contact/contact.repository";
import { ReviewsRepository } from "../../src/reviews/reviews.repository";
import { MemoryAuthRepository } from "./memory-auth.repository";
import { MemoryMarketplaceRepository } from "./memory-marketplace.repository";
import { MemoryRequestsRepository } from "./memory-requests.repository";
import {
  MemoryContactRepository,
  MemoryReviewsRepository,
} from "./memory-contact-reviews.repository";
export async function fixture(rate = false, reviewsV2 = false) {
  const auth = new MemoryAuthRepository(),
    catalog = new MemoryMarketplaceRepository(auth),
    repo = new MemoryRequestsRepository(auth, catalog);
  const contacts = new MemoryContactRepository(auth, repo),
    reviews = new MemoryReviewsRepository(repo, auth, catalog);
  const protectedReviews = new MemoryProtectedReviewsRepository(
    repo,
    auth,
    catalog,
  );
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AuthRepository)
    .useValue(auth)
    .overrideProvider(MarketplaceRepository)
    .useValue(catalog)
    .overrideProvider(RequestsRepository)
    .useValue(repo)
    .overrideProvider(ContactRepository)
    .useValue(contacts)
    .overrideProvider(ReviewsRepository)
    .useValue(reviews)
    .overrideProvider(ProtectedReviewsRepository)
    .useValue(protectedReviews)
    .overrideProvider(ConfigService)
    .useValue(
      new ConfigService({
        AUTH_ENABLED: true,
        REVIEWS_V2_ENABLED: reviewsV2,
        PERSISTENCE_ENABLED: false,
        NODE_ENV: "test",
        JWT_ACCESS_SECRET: randomBytes(64).toString("base64"),
        CORS_ORIGINS: [],
      }),
    );
  if (!rate)
    builder = builder
      .overrideProvider(RequestsRateGuard)
      .useValue({ canActivate: () => true });
  const module = await builder.compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const call = (
    path: string,
    method = "GET",
    body?: unknown,
    tokens?: AuthTokens,
    extraHeaders?: Record<string, string>,
  ) =>
    fetch(base + "/api/" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(reviewsV2 &&
        method === "POST" &&
        path.startsWith("reviews/requests/")
          ? { [PROTECTED_REVIEW_POLICY_HEADER]: PROTECTED_REVIEW_POLICY }
          : {}),
        ...extraHeaders,
        ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  let seq = 0;
  async function login(profiles: ("client" | "provider")[] = ["client"]) {
    const email = `request${seq++}@example.test`;
    await call("auth/register", "POST", {
      contact: {
        phone: "+5548998765432",
        hasWhatsapp: true,
        shareContact: true,
      },
      displayName: "Pessoa Teste",
      email,
      password: "uma senha de teste segura",
      profiles,
    });
    const response = await call("auth/login", "POST", {
      email,
      password: "uma senha de teste segura",
    });
    assert.equal(response.status, 200);
    return (await response.json()) as AuthTokens;
  }
  const provider = await login(["client", "provider"]),
    client = await login(),
    other = await login();
  const workspace = await catalog.own(provider.user.id);
  await catalog.updateProfile(provider.user.id, {
    professionalName: "Elétrica original",
  });
  const service = await catalog.createService(provider.user.id, {
    categoryId: catalog.categoryRows[0].id,
    title: "Instalação de tomadas",
  });
  const area = await catalog.createArea(provider.user.id, {
    city: "Araranguá",
    state: "SC",
    neighborhood: "Centro",
  });
  const input = (
    extra: Partial<CreateRequestInput> = {},
  ): CreateRequestInput => ({
    providerId: workspace.id,
    providerServiceId: service.id,
    description: "Preciso instalar duas tomadas.",
    city: "Araranguá",
    state: "SC",
    neighborhood: "Centro",
    idempotencyKey: randomUUID(),
    ...extra,
  });
  async function create(extra: Partial<CreateRequestInput> = {}) {
    const response = await call("requests", "POST", input(extra), client);
    assert.equal(response.status, 201);
    return (await response.json()) as ServiceRequestDetail;
  }
  async function act(
    row: ServiceRequestDetail,
    action: RequestAction,
    who: AuthTokens = provider,
    extra: Partial<RequestActionInput> = {},
  ) {
    return call(
      `requests/${row.id}/${action}`,
      "POST",
      { version: row.version, idempotencyKey: randomUUID(), ...extra },
      who,
    );
  }
  return {
    app,
    protectedReviews,
    contacts,
    reviews,
    auth,
    catalog,
    repo,
    call,
    login,
    provider,
    client,
    other,
    workspace,
    service,
    area,
    input,
    create,
    act,
  };
}
