import {
  act,
  fireEvent,
  renderRouter,
  screen,
  testRouter,
} from "expo-router/testing-library";
import type {
  CatalogCategory,
  CreateAreaInput,
  CreateServiceInput,
  ProviderPage,
  ProviderWorkspace,
  PublicProvider,
  UpdateAreaInput,
  UpdateProviderInput,
  UpdateServiceInput,
} from "@omini/shared";
import { AuthApi, AuthFailure } from "../src/auth/api";
import { MarketplaceHttp } from "../src/marketplace/api";
import { FakeAuthApi } from "./support/auth-fakes";
import { routes } from "./support/routes";
const category: CatalogCategory = {
  id: "20000000-0000-4000-8000-000000000001",
  slug: "eletrica",
  name: "Eletricista",
  isActive: true,
};
let auth: FakeAuthApi;
let profile: ProviderWorkspace;
let failed = false;
let block: Promise<void> | null = null;
let extraProviders: PublicProvider[] = [];
let requests: {
  path: string;
  method: string;
  body: unknown;
  access?: string;
}[];
const ownerId = "10000000-0000-4000-8000-000000000001";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function published(): PublicProvider[] {
  const own =
    profile.services.some((s) => s.isActive && s.category.isActive) &&
    profile.areas.some((a) => a.isActive) &&
    profile.isActive
      ? [
          {
            id: profile.id,
            professionalName: profile.professionalName,
            bio: profile.bio,
            services: profile.services.filter((s) => s.isActive),
            areas: profile.areas.filter((a) => a.isActive),
          },
        ]
      : [];
  return [...own, ...extraProviders];
}
beforeEach(() => {
  auth = new FakeAuthApi();
  profile = {
    id: "30000000-0000-4000-8000-000000000001",
    professionalName: "Pessoa Teste",
    bio: null,
    isActive: true,
    services: [],
    areas: [],
  };
  requests = [];
  failed = false;
  block = null;
  extraProviders = [];
  jest
    .spyOn(AuthApi.prototype, "login")
    .mockImplementation(auth.login.bind(auth));
  jest.spyOn(AuthApi.prototype, "me").mockImplementation(auth.me.bind(auth));
  jest
    .spyOn(AuthApi.prototype, "refresh")
    .mockImplementation(auth.refresh.bind(auth));
  jest
    .spyOn(AuthApi.prototype, "logout")
    .mockImplementation(auth.logout.bind(auth));
  jest
    .spyOn(AuthApi.prototype, "addProfile")
    .mockImplementation(auth.addProfile.bind(auth));
  jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockImplementation(async (path, method = "GET", body, access) => {
      requests.push({ path, method, body, access });
      if (block) await block;
      if (failed)
        throw new AuthFailure(
          0,
          "NETWORK",
          "Não foi possível conectar ao catálogo.",
        );
      if (path.startsWith("catalog/categories")) return clone([category]);
      if (path.startsWith("catalog/providers?")) {
        const q = new URL("http://fixture/" + path).searchParams;
        const term = (q.get("q") ?? "").toLowerCase();
        const all = published().filter(
          (p) =>
            (!term ||
              p.professionalName.toLowerCase().includes(term) ||
              p.services.some(
                (s) =>
                  s.category.name.toLowerCase().includes(term) ||
                  s.title.toLowerCase().includes(term),
              )) &&
            (!q.get("categoryId") ||
              p.services.some((s) => s.categoryId === q.get("categoryId"))) &&
            p.areas.some(
              (a) =>
                (!q.get("city") || a.city === q.get("city")) &&
                (!q.get("state") || a.state === q.get("state")) &&
                (!q.get("neighborhood") ||
                  !a.neighborhood ||
                  a.neighborhood === q.get("neighborhood")),
            ),
        );
        const page = Number(q.get("page") ?? 1),
          pageSize = Number(q.get("pageSize") ?? 10);
        return clone({
          items: all.slice((page - 1) * pageSize, page * pageSize),
          total: all.length,
          page,
          pageSize,
        } satisfies ProviderPage);
      }
      if (path.startsWith("catalog/providers/")) {
        const row = published().find((p) => p.id === path.split("/").at(-1));
        if (!row) throw new AuthFailure(404, "NOT_FOUND", "Indisponível");
        return clone(row);
      }
      if (!access || auth.value.id !== ownerId || !auth.value.profiles.provider)
        throw new AuthFailure(403, "PROVIDER_REQUIRED", "Ative seu perfil.");
      await auth.me(access);
      if (path === "provider/me") {
        if (method === "PATCH")
          Object.assign(profile, body as UpdateProviderInput);
        return clone(profile);
      }
      if (path === "provider/me/services" && method === "POST") {
        const input = body as CreateServiceInput;
        const value = {
          ...input,
          id: "40000000-0000-4000-8000-000000000001",
          description: input.description ?? null,
          isActive: true,
          category,
        };
        profile.services.push(value);
        return clone(value);
      }
      if (path.startsWith("provider/me/services/") && method === "PATCH") {
        const value = profile.services.find(
          (s) => s.id === path.split("/").at(-1),
        )!;
        Object.assign(value, body as UpdateServiceInput);
        return clone(value);
      }
      if (path === "provider/me/areas" && method === "POST") {
        const input = body as CreateAreaInput;
        const value = {
          ...input,
          id: "50000000-0000-4000-8000-000000000001",
          neighborhood: input.neighborhood ?? "",
          isActive: true,
        };
        profile.areas.push(value);
        return clone(value);
      }
      if (path.startsWith("provider/me/areas/") && method === "PATCH") {
        const value = profile.areas.find(
          (a) => a.id === path.split("/").at(-1),
        )!;
        Object.assign(value, body as UpdateAreaInput);
        return clone(value);
      }
      throw Error("Unexpected fixture endpoint: " + path);
    });
});
afterEach(() => jest.restoreAllMocks());
async function login() {
  await fireEvent.changeText(
    screen.getByLabelText("E-mail"),
    "pessoa@example.test",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Senha"),
    "uma senha de teste segura",
  );
  await fireEvent.press(screen.getByText("Entrar"));
  await screen.findByText("De que você precisa hoje?");
}
async function publicEntry() {
  await renderRouter(routes);
  await fireEvent.press(screen.getByText("Explorar Omini"));
  await fireEvent.press(screen.getByText("Buscar profissionais reais"));
  await screen.findByText("De que você precisa hoje?");
}
function completeFixture() {
  profile.professionalName = "João Elétrica";
  profile.bio = "Reparos residenciais.";
  profile.services = [
    {
      id: "40000000-0000-4000-8000-000000000001",
      categoryId: category.id,
      title: "Reparo elétrico",
      description: "Instalações",
      isActive: true,
      category,
    },
  ];
  profile.areas = [
    {
      id: "50000000-0000-4000-8000-000000000001",
      city: "Araranguá",
      state: "SC",
      neighborhood: "Centro",
      isActive: true,
    },
  ];
}

test("real forms enroll one provider, save profile/service/area, edit and deactivate data, then another client finds it", async () => {
  await renderRouter(routes, { initialUrl: "/login" });
  await screen.findByText("Que bom ter você aqui");
  await login();
  await testRouter.push("/client/profile");
  await fireEvent.press(screen.getByText("Adicionar perfil de prestador"));
  await fireEvent.press(await screen.findByText("Mudar para prestador"));
  await screen.findByText("Complete seu cadastro");
  await testRouter.push("/provider/profile");
  await screen.findByLabelText("Nome profissional");
  await fireEvent.changeText(
    screen.getByLabelText("Nome profissional"),
    "João Elétrica",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Descrição profissional"),
    "Reparos residenciais.",
  );
  await fireEvent.press(screen.getByText("Salvar perfil profissional"));
  await screen.findByText("Perfil profissional salvo.");
  await screen.findByLabelText("Bairro atendido");
  await fireEvent.changeText(
    screen.getByLabelText("Bairro atendido"),
    "Centro",
  );
  await fireEvent.press(screen.getByText("Cadastrar área"));
  await screen.findByText("Área de atendimento salva.");
  await testRouter.push("/provider/services");
  await screen.findByLabelText("Título do serviço");
  await fireEvent.press(screen.getByRole("radio", { name: "Eletricista" }));
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Reparo elétrico",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Descrição do serviço"),
    "Instalações residenciais.",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Cadastrar serviço" }),
  );
  await screen.findByText("Serviço salvo.");
  await fireEvent.press(await screen.findByText("Editar Reparo elétrico"));
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Instalações elétricas",
  );
  await fireEvent.press(screen.getByText("Salvar alterações do serviço"));
  await screen.findByText("Serviço salvo.");
  await fireEvent.press(
    await screen.findByText("Desativar Instalações elétricas"),
  );
  await screen.findByText("Serviço desativado.");
  expect(published()).toHaveLength(0);
  await fireEvent.press(
    await screen.findByText("Reativar Instalações elétricas"),
  );
  await screen.findByText("Serviço reativado.");
  await testRouter.push("/provider/profile");
  await fireEvent.press(await screen.findByText("Desativar área Centro"));
  await screen.findByText("Área desativada.");
  expect(published()).toHaveLength(0);
  await fireEvent.press(await screen.findByText("Reativar área Centro"));
  await screen.findByText("Área reativada.");
  await fireEvent.press(screen.getByText("Sair da conta"));
  await screen.findByText("Entrar na minha conta");
  auth.value = {
    ...auth.value,
    id: "10000000-0000-4000-8000-000000000002",
    displayName: "Cliente B",
    profiles: { client: true, provider: false },
  };
  await fireEvent.press(screen.getByText("Entrar na minha conta"));
  await screen.findByText("Que bom ter você aqui");
  await login();
  await fireEvent.press(
    await screen.findByLabelText("Ver perfil de João Elétrica"),
  );
  expect(await screen.findByText("Instalações elétricas")).toBeTruthy();
  expect(screen.getByText("Reparos residenciais.")).toBeTruthy();
  expect(screen.getByText("Centro")).toBeTruthy();
  expect(screen.getByText("Solicitar atendimento · em breve")).toBeDisabled();
  expect(profile.services).toHaveLength(1);
  expect(profile.areas).toHaveLength(1);
  expect(
    requests.filter((r) => r.method !== "GET").every((r) => !!r.access),
  ).toBe(true);
  expect(
    requests
      .filter((r) => r.method !== "GET")
      .every((r) => !JSON.stringify(r.body).includes("userId")),
  ).toBe(true);
});
test("anonymous real catalog uses API categories and filters with no fictitious fallback", async () => {
  completeFixture();
  await publicEntry();
  await testRouter.push("/client/categories");
  await fireEvent.press(await screen.findByText("Eletricista"));
  await screen.findByText("1 profissionais encontrados");
  expect(
    screen.queryByLabelText("Ver perfil demonstrativo de Ana Martins"),
  ).toBeNull();
  await fireEvent.changeText(
    screen.getByLabelText("Buscar por nome ou serviço"),
    "inexistente",
  );
  await fireEvent.press(screen.getByText("Pesquisar profissionais"));
  await screen.findByText("Nenhum profissional encontrado");
  await fireEvent.changeText(
    screen.getByLabelText("Buscar por nome ou serviço"),
    "Eletricista",
  );
  await fireEvent.press(screen.getByText("Filtrar por localidade"));
  await fireEvent.changeText(screen.getByLabelText("Filtrar bairro"), "Centro");
  await fireEvent.press(screen.getByText("Pesquisar profissionais"));
  await screen.findByText("1 profissionais encontrados");
  const query = requests
    .filter((r) => r.path.startsWith("catalog/providers?"))
    .at(-1)!;
  const params = new URL("http://fixture/" + query.path).searchParams;
  expect(params.get("categoryId")).toBe(category.id);
  expect(params.get("neighborhood")).toBe("Centro");
  expect(params.get("city")).toBe("Araranguá");
  expect(query.access).toBeUndefined();
  expect(screen.getByText("Próxima página")).toBeDisabled();
});
test("real catalog pagination changes the page without duplicating or mixing demo records", async () => {
  completeFixture();
  const item = published()[0];
  profile.isActive = false;
  extraProviders = Array.from({ length: 11 }, (_, i) => ({
    ...item,
    id: `provider-${i}`,
    professionalName: `Profissional ${i + 1}`,
  }));
  await publicEntry();
  await testRouter.push("/client/search");
  await screen.findByText("11 profissionais encontrados");
  await fireEvent.press(screen.getByText("Próxima página"));
  expect(
    await screen.findByLabelText("Ver perfil de Profissional 11"),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Ver perfil de Profissional 1")).toBeNull();
  expect(screen.getByText("Próxima página")).toBeDisabled();
  await fireEvent.press(screen.getByText("Página anterior"));
  expect(
    await screen.findByLabelText("Ver perfil de Profissional 1"),
  ).toBeTruthy();
});
test("catalog loading, safe connection failure, retry and empty states are clear", async () => {
  let release!: () => void;
  block = new Promise<void>((resolve) => {
    release = resolve;
  });
  failed = true;
  await publicEntry();
  expect(screen.getByLabelText("Carregando dados")).toBeTruthy();
  await act(async () => {
    release();
  });
  expect(
    await screen.findByText("Não foi possível conectar ao catálogo."),
  ).toBeTruthy();
  expect(
    screen.queryByLabelText("Ver perfil demonstrativo de Ana Martins"),
  ).toBeNull();
  failed = false;
  block = null;
  await fireEvent.press(screen.getByText("Tentar novamente"));
  expect(
    await screen.findByText("Nenhum profissional encontrado"),
  ).toBeTruthy();
});
test("provider validation avoids writes and expired private sessions return to the existing login flow", async () => {
  auth.value.profiles.provider = true;
  await renderRouter(routes, { initialUrl: "/login" });
  await screen.findByText("Que bom ter você aqui");
  await login();
  await testRouter.push("/client/profile");
  await fireEvent.press(screen.getByText("Mudar para prestador"));
  await screen.findByText("Complete seu cadastro");
  await testRouter.push("/provider/services");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Cadastrar serviço" }),
  );
  expect(
    await screen.findByText(
      "Escolha uma categoria ativa e informe título de 2 a 120 caracteres. A descrição aceita até 1000.",
    ),
  ).toBeTruthy();
  expect(profile.services).toHaveLength(0);
  await fireEvent.press(screen.getByRole("radio", { name: "Eletricista" }));
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Reparo elétrico",
  );
  auth.forceUnauthorized = true;
  auth.failRefresh = new AuthFailure(401, "SESSION_EXPIRED", "Expired");
  await fireEvent.press(
    screen.getByRole("button", { name: "Cadastrar serviço" }),
  );
  expect(
    await screen.findByText("Sua sessão expirou. Entre novamente."),
  ).toBeTruthy();
  expect(screen.getByLabelText("Senha")).toBeTruthy();
  expect(profile.services).toHaveLength(0);
});
