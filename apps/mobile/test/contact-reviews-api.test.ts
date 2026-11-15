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
