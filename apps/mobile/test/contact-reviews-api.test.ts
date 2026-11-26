import { ContactApi } from "../src/contact/api";
import { ReviewsApi } from "../src/reviews/api";
import { MarketplaceHttp } from "../src/marketplace/api";
import { SessionManager } from "../src/auth/session-manager";
import { FakeAuthApi, FakeStorage } from "./support/auth-fakes";
afterEach(() => jest.restoreAllMocks());
test("retained contact/review adapters cannot execute writes or private reads as a different signed-in account", async () => {
  const auth = new FakeAuthApi(),
    manager = new SessionManager(auth, new FakeStorage());
  await manager.login("first@example.test", "test password");
  const contact = new ContactApi(manager),
    reviews = new ReviewsApi(manager);
  const http = jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockRejectedValue(Error("must not reach HTTP"));
  await manager.logout();
  auth.value.id = "10000000-0000-4000-8000-000000000002";
  await manager.login("second@example.test", "test password");
  for (const operation of [
    () => contact.own(),
    () =>
      contact.update({
        phone: "+5548998765432",
        hasWhatsapp: true,
        shareContact: true,
      }),
    () => contact.request("request"),
    () => reviews.request("request"),
    () => reviews.create("request", { rating: 5 }),
    () => reviews.page("provider", 1, true),
  ])
    await expect(operation()).rejects.toMatchObject({
      code: "ACCOUNT_CHANGED",
    });
  expect(http).not.toHaveBeenCalled();
});
test("public reputation remains anonymous while invalid wire ratings cannot become a fictitious summary", async () => {
  const manager = new SessionManager(new FakeAuthApi(), new FakeStorage()),
    api = new ReviewsApi(manager);
  const http = jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockResolvedValue({
      average: null,
      total: 0,
      page: 1,
      pageSize: 5,
      items: [],
    });
  expect((await api.page("provider")).average).toBeNull();
  expect(http.mock.calls[0]).toEqual([
    "reviews/providers/provider?page=1&pageSize=5",
  ]);
  http.mockResolvedValue({
    average: 5,
    total: 0,
    page: 1,
    pageSize: 5,
    items: [],
  });
  await expect(api.page("provider")).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
});

test("protected responses validate distributions and reject exposed individual records or malformed privacy flags", async () => {
  const manager = new SessionManager(new FakeAuthApi(), new FakeStorage()),
    api = new ReviewsApi(manager);
  const base = {
    average: null,
    total: 0,
    page: 1,
    pageSize: 5,
    items: [],
    anonymous: true,
    privacyProtected: true,
    distribution: ([5, 4, 3, 2, 1] as const).map((stars) => ({
      stars,
      count: 0,
    })),
  };
  const http = jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockResolvedValue(base);
  expect((await api.page("provider")).privacyProtected).toBe(true);
  for (const response of [
    { ...base, total: 1, average: 5 },
    { ...base, anonymous: "true" },
    { ...base, distribution: [{ stars: 5, count: 0 }] },
    {
      ...base,
      distribution: [...base.distribution.slice(0, 4), { stars: 5, count: 0 }],
    },
  ]) {
    http.mockResolvedValue(response);
    await expect(api.page("provider")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  }
});
test("client reputation uses authenticated request-scoped routes and retained adapters cannot read after account changes", async () => {
  const auth = new FakeAuthApi(),
    manager = new SessionManager(auth, new FakeStorage());
  await manager.login("first@example.test", "test password");
  const api = new ReviewsApi(manager),
    http = jest.spyOn(MarketplaceHttp.prototype, "request").mockResolvedValue({
      average: null,
      total: 0,
      page: 1,
      pageSize: 10,
      items: [],
      anonymous: true,
      privacyProtected: true,
      distribution: ([5, 4, 3, 2, 1] as const).map((stars) => ({
        stars,
        count: 0,
      })),
    });
  await api.clientReputation("request");
  expect(http).toHaveBeenCalledWith(
    "reputation/requests/request/client",
    "GET",
    undefined,
    expect.any(String),
  );
  await api.clientReputation();
  expect(http).toHaveBeenCalledWith(
    "reputation/me/client",
    "GET",
    undefined,
    expect.any(String),
  );
  await manager.logout();
  auth.value.id = "10000000-0000-4000-8000-000000000002";
  await manager.login("second@example.test", "test password");
  http.mockClear();
  await expect(api.clientReputation("request")).rejects.toMatchObject({
    code: "ACCOUNT_CHANGED",
  });
  expect(http).not.toHaveBeenCalled();
});
test("provider own receipts and review opportunities preserve direction, deadline and sealed content", async () => {
  const manager = new SessionManager(new FakeAuthApi(), new FakeStorage());
  await manager.login("first@example.test", "test password");
  const api = new ReviewsApi(manager);
  const http = jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockResolvedValue({
      canReview: true,
      review: null,
      viewer: "provider",
      target: "client",
      protected: true,
      closesAt: "2026-12-15T12:00:00Z",
    });
  expect((await api.request("request")).target).toBe("client");
  http.mockResolvedValue({
    id: "own",
    rating: 2,
    comment: null,
    createdAt: "2026-12-01T12:00:00Z",
    authorLabel: "Prestador Omini",
    protected: true,
  });
  expect((await api.create("request", { rating: 2 })).rating).toBe(2);
});

test("private client reputation fails closed when an API response lacks the anonymous protection contract", async () => {
  const manager = new SessionManager(new FakeAuthApi(), new FakeStorage());
  await manager.login("first@example.test", "test password");
  const api = new ReviewsApi(manager);
  jest.spyOn(MarketplaceHttp.prototype, "request").mockResolvedValue({
    average: 5,
    total: 1,
    page: 1,
    pageSize: 10,
    items: [],
  });
  await expect(api.clientReputation("request")).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
});
