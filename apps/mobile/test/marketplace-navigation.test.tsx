import {
  act,
  fireEvent,
  renderRouter,
  screen,
  testRouter,
} from "expo-router/testing-library";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as ReactNative from "react-native";
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
  category.isActive = true;
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
  await screen.findByRole("button", {
    name: "Meus serviços. Pendente. Abrir etapa.",
  });
  await testRouter.push("/provider/profile");
  await fireEvent.press(
    await screen.findByText("Editar meu perfil profissional"),
  );
  await screen.findByLabelText("Nome profissional");
  await fireEvent.changeText(
    screen.getByLabelText("Nome profissional"),
    "João Elétrica",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Descrição profissional"),
    "Reparos residenciais.",
  );
  await fireEvent.press(screen.getByText("Salvar perfil"));
  await screen.findByText("Perfil profissional salvo.");
  expect(screen.queryByLabelText("Nome profissional")).toBeNull();
  await fireEvent.press(screen.getByText("Onde atendo"));
  await screen.findByText("Onde você pode ajudar?");
  await fireEvent.press(screen.getByText("Adicionar área"));
  await screen.findByLabelText("Bairro atendido");
  await fireEvent.changeText(
    screen.getByLabelText("Bairro atendido"),
    "Centro",
  );
  await fireEvent.press(screen.getByText("Salvar área"));
  await screen.findByText("Área de atendimento salva.");
  await testRouter.push("/provider/services");
  await screen.findByText("Seu primeiro serviço começa aqui");
  expect(screen.queryByLabelText("Título do serviço")).toBeNull();
  await fireEvent.press(screen.getByText("Adicionar serviço"));
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
  await fireEvent.press(screen.getByText("Salvar serviço"));
  await screen.findByText("Serviço salvo.");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: /^Gerenciar serviço Reparo elétrico/,
    }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Editar serviço" }));
  await screen.findByLabelText("Título do serviço");
  expect(screen.getByLabelText("Descrição do serviço")).toHaveDisplayValue(
    "Instalações residenciais.",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Instalações elétricas",
  );
  await fireEvent.press(screen.getByText("Salvar serviço"));
  await screen.findByText("Serviço salvo.");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: /^Gerenciar serviço Instalações elétricas/,
    }),
  );
  await fireEvent.press(screen.getByText("Desativar serviço"));
  expect(profile.services[0].isActive).toBe(true);
  await fireEvent.press(screen.getByText("Confirmar desativação"));
  await screen.findByText("Serviço desativado.");
  expect(published()).toHaveLength(0);
  await fireEvent.press(
    await screen.findByRole("button", {
      name: /^Gerenciar serviço Instalações elétricas/,
    }),
  );
  await fireEvent.press(screen.getByText("Reativar serviço"));
  await fireEvent.press(screen.getByText("Confirmar reativação"));
  await screen.findByText("Serviço reativado.");
  await testRouter.push("/provider/areas");
  await fireEvent.press(
    await screen.findByRole("button", {
      name: /^Gerenciar área Araranguá\/SC/,
    }),
  );
  await fireEvent.press(screen.getByText("Desativar área"));
  await fireEvent.press(screen.getByText("Confirmar desativação"));
  await screen.findByText("Área desativada.");
  expect(published()).toHaveLength(0);
  await fireEvent.press(
    await screen.findByRole("button", {
      name: /^Gerenciar área Araranguá\/SC/,
    }),
  );
  await fireEvent.press(screen.getByText("Reativar área"));
  await fireEvent.press(screen.getByText("Confirmar reativação"));
  await screen.findByText("Área reativada.");
  await testRouter.push("/provider/profile");
  await fireEvent.press(screen.getByText("Minha conta"));
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
  expect(
    screen.getByRole("button", { name: "Solicitar serviço" }),
  ).toBeEnabled();
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
  await screen.findByRole("button", {
    name: "Meus serviços. Pendente. Abrir etapa.",
  });
  await testRouter.push("/provider/services");
  await screen.findByText("Seu primeiro serviço começa aqui");
  await fireEvent.press(screen.getByText("Adicionar serviço"));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Salvar serviço" }),
  );
  expect(
    await screen.findByText(
      "Escolha uma categoria e informe um nome de 2 a 120 caracteres. A descrição aceita até 1000.",
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
  await fireEvent.press(screen.getByRole("button", { name: "Salvar serviço" }));
  expect(
    await screen.findByText("Sua sessão expirou. Entre novamente."),
  ).toBeTruthy();
  expect(screen.getByLabelText("Senha")).toBeTruthy();
  expect(profile.services).toHaveLength(0);
});

async function providerEntry() {
  auth.value.profiles.provider = true;
  await renderRouter(routes, { initialUrl: "/login" });
  await screen.findByText("Que bom ter você aqui");
  await login();
  await testRouter.push("/client/profile");
  await fireEvent.press(screen.getByText("Mudar para prestador"));
  await screen.findByText("Meu espaço profissional");
}
async function servicesList() {
  await testRouter.push("/provider/services");
  await screen.findByRole("button", {
    name: "Adicionar serviço",
    disabled: false,
  });
}
test("provider checklist derives progress and the next action from actual active records, without requiring optional bio", async () => {
  await providerEntry();
  expect(
    await screen.findByRole("button", {
      name: "Meu perfil. Concluído. Abrir etapa.",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "Meus serviços. Pendente. Abrir etapa.",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Onde atendo. Pendente. Abrir etapa." }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Adicionar serviço" }),
  ).toBeTruthy();
  expect(
    screen.queryByText("Seu cadastro está visível para clientes"),
  ).toBeNull();
  completeFixture();
  profile.bio = null;
  await servicesList();
  await testRouter.push("/provider");
  expect(
    await screen.findByText("Seu cadastro está visível para clientes"),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "Meus serviços. Concluído. Abrir etapa.",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "Onde atendo. Concluído. Abrir etapa.",
    }),
  ).toBeTruthy();
  profile.services[0].category.isActive = false;
  await servicesList();
  await testRouter.push("/provider");
  expect(
    await screen.findByRole("button", { name: "Revisar meus serviços" }),
  ).toBeTruthy();
  expect(
    screen.queryByText("Seu cadastro está visível para clientes"),
  ).toBeNull();
});
test("contextual help remains available before and after first setup and closes without mandatory tutorial", async () => {
  await providerEntry();
  expect(screen.queryByText("Por onde começo?")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Ajuda" }));
  expect(screen.getByText("Por onde começo?")).toBeTruthy();
  await fireEvent.press(screen.getByText("Entendi"));
  await servicesList();
  await fireEvent.press(screen.getByRole("button", { name: "Ajuda" }));
  for (const title of [
    "Como cadastrar?",
    "Como editar?",
    "Como desativar?",
    "Como reativar?",
  ])
    expect(screen.getByText(title)).toBeTruthy();
  await fireEvent.press(screen.getByText("Entendi"));
  await fireEvent.press(screen.getByText("Adicionar serviço"));
  await screen.findByLabelText("Título do serviço");
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Troca de tomadas",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Ajuda" }));
  expect(screen.getByText("Descrição opcional")).toBeTruthy();
  await fireEvent.press(screen.getByText("Entendi"));
  expect(screen.getByLabelText("Título do serviço")).toHaveDisplayValue(
    "Troca de tomadas",
  );
  await fireEvent.press(screen.getByText("Cancelar"));
  await fireEvent.press(await screen.findByText("Descartar alterações"));
  completeFixture();
  await testRouter.push("/provider");
  await screen.findByText("Seu cadastro está visível para clientes");
  await fireEvent.press(screen.getByRole("button", { name: "Ajuda" }));
  expect(screen.getByText("Quando apareço na busca?")).toBeTruthy();
  await fireEvent.press(screen.getByText("Entendi"));
});
test("modified forms preserve drafts on back/cancel and discard only after explicit confirmation", async () => {
  await providerEntry();
  await servicesList();
  expect(screen.queryByLabelText("Título do serviço")).toBeNull();
  await fireEvent.press(screen.getByText("Adicionar serviço"));
  await screen.findByLabelText("Título do serviço");
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Rascunho de instalação",
  );
  await fireEvent.press(screen.getByLabelText("Voltar"));
  expect(await screen.findByText("Sair sem salvar?")).toBeTruthy();
  await fireEvent.press(screen.getByText("Continuar editando"));
  expect(screen.getByLabelText("Título do serviço")).toHaveDisplayValue(
    "Rascunho de instalação",
  );
  await fireEvent.press(screen.getByText("Cancelar"));
  await fireEvent.press(await screen.findByText("Descartar alterações"));
  await screen.findByText("Seu primeiro serviço começa aqui");
  expect(requests.filter((r) => r.method !== "GET")).toHaveLength(0);
  await fireEvent.press(screen.getByText("Adicionar serviço"));
  expect(await screen.findByLabelText("Título do serviço")).toHaveDisplayValue(
    "",
  );
  await fireEvent.press(screen.getByText("Cancelar"));
  expect(
    await screen.findByText("Seu primeiro serviço começa aqui"),
  ).toBeTruthy();
  expect(screen.queryByText("Sair sem salvar?")).toBeNull();
});
test("manage menu is explicit and canceling visibility confirmation never mutates a service", async () => {
  completeFixture();
  await providerEntry();
  await servicesList();
  expect(screen.queryByLabelText("Título do serviço")).toBeNull();
  expect(screen.queryByText("Editar serviço")).toBeNull();
  await fireEvent.press(
    await screen.findByRole("button", {
      name: /^Gerenciar serviço Reparo elétrico/,
    }),
  );
  expect(screen.getByRole("button", { name: "Editar serviço" })).toBeTruthy();
  await fireEvent.press(screen.getByText("Desativar serviço"));
  expect(
    screen.getByText(
      "Este serviço deixará de aparecer para clientes, mas continuará salvo. Você pode reativá-lo depois.",
    ),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText("Cancelar"));
  expect(profile.services[0].isActive).toBe(true);
  expect(requests.filter((r) => r.method === "PATCH")).toHaveLength(0);
  await fireEvent.press(
    screen.getByRole("button", { name: /^Gerenciar serviço Reparo elétrico/ }),
  );
  await fireEvent.press(screen.getByText("Desativar serviço"));
  await fireEvent.press(screen.getByText("Confirmar desativação"));
  await screen.findByText("Serviço desativado.");
  expect(profile.services).toHaveLength(1);
  expect(profile.services[0].isActive).toBe(false);
});
test("area management edits a saved record, supports whole-city coverage and keeps account data separate", async () => {
  completeFixture();
  await providerEntry();
  await testRouter.push("/provider/profile");
  await screen.findByText("Editar meu perfil profissional");
  expect(screen.queryByText("pessoa@example.test")).toBeNull();
  expect(screen.queryByLabelText("Bairro atendido")).toBeNull();
  await fireEvent.press(screen.getByText("Onde atendo"));
  await fireEvent.press(
    await screen.findByRole("button", {
      name: /^Gerenciar área Araranguá\/SC/,
    }),
  );
  await fireEvent.press(screen.getByText("Editar área"));
  expect(await screen.findByLabelText("Cidade atendida")).toHaveDisplayValue(
    "Araranguá",
  );
  expect(screen.getByLabelText("Bairro atendido")).toHaveDisplayValue("Centro");
  await fireEvent.changeText(
    screen.getByLabelText("Cidade atendida"),
    "Criciúma",
  );
  await fireEvent.changeText(screen.getByLabelText("Bairro atendido"), "");
  expect(
    screen.getByText("Se você atende toda a cidade, deixe o bairro em branco."),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText("Salvar área"));
  await screen.findByText("Área de atendimento salva.");
  expect(await screen.findByText("Toda a cidade")).toBeTruthy();
  expect(profile.areas).toHaveLength(1);
  expect(profile.areas[0].city).toBe("Criciúma");
  await testRouter.push("/provider/profile");
  await fireEvent.press(screen.getByText("Minha conta"));
  expect(await screen.findByText("pessoa@example.test")).toBeTruthy();
  expect(screen.queryByLabelText("Nome profissional")).toBeNull();
});
test("form loading/retry/errors are clear and failed saves preserve the typed draft", async () => {
  await providerEntry();
  await servicesList();
  failed = true;
  await fireEvent.press(screen.getByText("Adicionar serviço"));
  await screen.findByText("Não foi possível conectar ao catálogo.");
  expect(screen.queryByLabelText("Título do serviço")).toBeNull();
  expect(screen.getByRole("button", { name: "Ajuda" })).toBeTruthy();
  failed = false;
  await fireEvent.press(screen.getByText("Tentar novamente"));
  await screen.findByLabelText("Título do serviço");
  await fireEvent.press(screen.getByRole("radio", { name: "Eletricista" }));
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Serviço que não pode ser perdido",
  );
  failed = true;
  await fireEvent.press(screen.getByText("Salvar serviço"));
  await screen.findByText("Não foi possível conectar ao catálogo.");
  expect(screen.getByLabelText("Título do serviço")).toHaveDisplayValue(
    "Serviço que não pode ser perdido",
  );
  expect(profile.services).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Salvar serviço" })).toBeEnabled();
});
test("saving prevents duplicate submissions and leaving while the request is pending", async () => {
  await providerEntry();
  await servicesList();
  await fireEvent.press(screen.getByText("Adicionar serviço"));
  await screen.findByLabelText("Título do serviço");
  await fireEvent.press(screen.getByRole("radio", { name: "Eletricista" }));
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Instalação de tomadas",
  );
  let release!: () => void;
  block = new Promise<void>((resolve) => {
    release = resolve;
  });
  await fireEvent.press(screen.getByText("Salvar serviço"));
  expect(screen.getByRole("button", { name: "Salvar serviço" })).toBeDisabled();
  await fireEvent.press(screen.getByText("Salvar serviço"));
  await fireEvent.press(screen.getByLabelText("Voltar"));
  await screen.findByText("Salvando alterações");
  expect(screen.queryByText("Descartar alterações")).toBeNull();
  await fireEvent.press(screen.getByText("Continuar aqui"));
  await act(async () => {
    release();
  });
  await screen.findByText("Serviço salvo.");
  expect(
    requests.filter(
      (r) => r.method === "POST" && r.path === "provider/me/services",
    ),
  ).toHaveLength(1);
  expect(profile.services).toHaveLength(1);
});
test("dedicated provider forms cannot be opened anonymously or from a client-only account", async () => {
  await renderRouter(routes, { initialUrl: "/provider-setup/service" });
  await screen.findByText("Que bom ter você aqui");
  expect(screen.queryByLabelText("Título do serviço")).toBeNull();
  await login();
  await act(async () => router.push("/provider-setup/area"));
  expect(await screen.findByText("Adicionar perfil de prestador")).toBeTruthy();
  expect(screen.queryByLabelText("Cidade atendida")).toBeNull();
  expect(requests.filter((r) => r.path.startsWith("provider/me"))).toHaveLength(
    0,
  );
});

test("the first service leads to coverage and back to the completed professional checklist", async () => {
  await providerEntry();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Adicionar serviço" }),
  );
  await screen.findByLabelText("Título do serviço");
  await fireEvent.press(screen.getByRole("radio", { name: "Eletricista" }));
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Instalação de tomadas",
  );
  await fireEvent.press(screen.getByText("Salvar serviço"));
  await fireEvent.press(await screen.findByText("Continuar: onde atendo"));
  await screen.findByLabelText("Cidade atendida");
  expect(screen.getByLabelText("Bairro atendido")).toHaveDisplayValue("");
  await fireEvent.press(screen.getByText("Salvar área"));
  expect(screen.queryByRole("button", { name: "Ver meu painel" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Painel" }));
  expect(
    await screen.findByText("Seu cadastro está visível para clientes"),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "Onde atendo. Concluído. Abrir etapa.",
    }),
  ).toBeTruthy();
});

async function nativeBack() {
  // Dispatches the same GO_BACK navigation intent used by native back; it does not exercise an iOS gesture recognizer.
  await act(async () => router.back());
}
const providerSections = [
  { path: "/provider/services", step: "Meus serviços", title: "Meus serviços" },
  { path: "/provider/profile", step: "Meu perfil", title: "Meu perfil" },
  { path: "/provider/areas", step: "Onde atendo", title: "Onde atendo" },
] as const;

test("every provider section opens as a stack page and native back returns to the dashboard without changing saved data", async () => {
  completeFixture();
  const saved = clone(profile);
  await providerEntry();
  for (const section of providerSections) {
    await fireEvent.press(
      await screen.findByRole("button", {
        name: `${section.step}. Concluído. Abrir etapa.`,
      }),
    );
    await screen.findByRole("header", { name: section.title });
    expect(screen).toHavePathname(section.path);
    expect(screen.getByRole("button", { name: "Voltar" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Painel" })).toBeNull();
    await nativeBack();
    expect(
      await screen.findByRole("header", { name: "Meu espaço profissional" }),
    ).toBeTruthy();
    expect(screen).toHavePathname("/provider");
  }
  expect(profile).toEqual(saved);
  expect(requests.filter((request) => request.method !== "GET")).toHaveLength(
    0,
  );
});

test.each(["services", "profile", "areas"] as const)(
  "saving the %s form returns to its own section, then back returns to dashboard",
  async (section) => {
    await providerEntry();
    const target = providerSections.find((item) =>
      item.path.endsWith(section),
    )!;
    await fireEvent.press(
      await screen.findByRole("button", {
        name: new RegExp(`^${target.step}\\.`),
      }),
    );
    await screen.findByRole("header", { name: target.title });
    if (section === "services") {
      await fireEvent.press(
        screen.getByRole("button", { name: "Adicionar serviço" }),
      );
      await fireEvent.press(
        await screen.findByRole("radio", { name: "Eletricista" }),
      );
      await fireEvent.changeText(
        screen.getByLabelText("Título do serviço"),
        "Instalação de tomadas",
      );
      await fireEvent.press(
        screen.getByRole("button", { name: "Salvar serviço" }),
      );
      await screen.findByText("Serviço salvo.");
      expect(profile.services).toHaveLength(1);
    } else if (section === "profile") {
      await fireEvent.press(
        await screen.findByText("Editar meu perfil profissional"),
      );
      await screen.findByLabelText("Nome profissional");
      await fireEvent.changeText(
        screen.getByLabelText("Nome profissional"),
        "João Elétrica",
      );
      await fireEvent.press(
        screen.getByRole("button", { name: "Salvar perfil" }),
      );
      await screen.findByText("Perfil profissional salvo.");
      expect(profile.professionalName).toBe("João Elétrica");
    } else {
      await fireEvent.press(
        screen.getByRole("button", { name: "Adicionar área" }),
      );
      await screen.findByLabelText("Cidade atendida");
      await fireEvent.press(
        screen.getByRole("button", { name: "Salvar área" }),
      );
      await screen.findByText("Área de atendimento salva.");
      expect(profile.areas).toHaveLength(1);
    }
    expect(screen).toHavePathname(target.path);
    await nativeBack();
    expect(
      await screen.findByRole("header", { name: "Meu espaço profissional" }),
    ).toBeTruthy();
    expect(screen).toHavePathname("/provider");
  },
);

test("account reopens the professional dashboard in the same mode without a client round trip", async () => {
  completeFixture();
  await providerEntry();
  await fireEvent.press(screen.getByRole("button", { name: "Minha conta" }));
  await screen.findByText("pessoa@example.test");
  expect(
    screen.getByRole("button", { name: "Mudar para cliente" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Mudar para prestador" }),
  ).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Painel" }));
  await screen.findByRole("header", { name: "Meu espaço profissional" });
  expect(screen).toHavePathname("/provider");
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Meus serviços. Concluído. Abrir etapa.",
    }),
  );
  await screen.findByRole("header", { name: "Meus serviços" });
  await fireEvent.press(screen.getByRole("button", { name: "Voltar" }));
  await screen.findByRole("header", { name: "Meu espaço profissional" });
  expect(screen).toHavePathname("/provider");
  expect(auth.value.profiles).toEqual({ client: true, provider: true });
});

test("welcome offers explicit professional entry while leaving the selected client experience unchanged until tapped", async () => {
  auth.value.profiles.provider = true;
  await renderRouter(routes, { initialUrl: "/login" });
  await screen.findByText("Que bom ter você aqui");
  await login();
  await testRouter.push("/");
  expect(
    screen.getByRole("button", { name: "Meu espaço profissional" }),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Minha conta" }));
  expect(
    await screen.findByRole("button", { name: "Mudar para prestador" }),
  ).toBeTruthy();
  await nativeBack();
  await fireEvent.press(
    screen.getByRole("button", { name: "Meu espaço profissional" }),
  );
  expect(
    await screen.findByRole("header", { name: "Meu espaço profissional" }),
  ).toBeTruthy();
  expect(screen).toHavePathname("/provider");
  await fireEvent.press(screen.getByRole("button", { name: "Minha conta" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Mudar para cliente" }),
  );
  await screen.findByText("De que você precisa hoje?");
  await testRouter.push("/client/profile");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Meu espaço profissional" }),
  );
  expect(
    await screen.findByRole("header", { name: "Meu espaço profissional" }),
  ).toBeTruthy();
});

test("explicit professional entry from demo account restores the real catalog without changing modes automatically", async () => {
  await providerEntry();
  await fireEvent.press(screen.getByRole("button", { name: "Minha conta" }));
  await fireEvent.press(await screen.findByText("Voltar às boas-vindas"));
  await fireEvent.press(screen.getByText("Explorar Omini"));
  await fireEvent.press(screen.getByText("Conhecer o modo prestador"));
  await screen.findByText("Seu talento faz a diferença.");
  await fireEvent.press(screen.getByRole("button", { name: "Minha conta" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Abrir meu cadastro real" }),
  );
  expect(
    await screen.findByRole("header", { name: "Meu espaço profissional" }),
  ).toBeTruthy();
  expect(screen.queryByText("Painel demonstrativo")).toBeNull();
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "Meus serviços. Pendente. Abrir etapa.",
    }),
  );
  expect(
    await screen.findByText("Seu primeiro serviço começa aqui"),
  ).toBeTruthy();
});

const directProviderRoutes = [
  { path: "/provider/account", section: "Minha conta", form: false },
  { path: "/provider/services", section: "Meus serviços", form: false },
  { path: "/provider/profile", section: "Meu perfil", form: false },
  { path: "/provider/areas", section: "Onde atendo", form: false },
  { path: "/provider/services/edit", section: "Meus serviços", form: true },
  { path: "/provider/profile/edit", section: "Meu perfil", form: true },
  { path: "/provider/areas/edit", section: "Onde atendo", form: true },
  {
    path: "/provider-setup/service?id=40000000-0000-4000-8000-000000000001",
    section: "Meus serviços",
    form: true,
  },
  { path: "/provider-setup/profile", section: "Meu perfil", form: true },
  {
    path: "/provider-setup/area?id=50000000-0000-4000-8000-000000000001",
    section: "Onde atendo",
    form: true,
  },
  { path: "/provider-setup/areas", section: "Onde atendo", form: false },
];
test.each(directProviderRoutes)(
  "cold restored deep link $path has a section/dashboard back hierarchy without account history",
  async ({ path, section, form }) => {
    completeFixture();
    const saved = clone(profile);
    auth.value.profiles = { client: false, provider: true };
    const read = jest.mocked(SecureStore.getItemAsync);
    read.mockResolvedValue(
      JSON.stringify({ token: "x".repeat(43), intent: "refresh" }),
    );
    try {
      await renderRouter(routes, { initialUrl: path });
      if (form) {
        const label =
          section === "Meus serviços"
            ? "Título do serviço"
            : section === "Meu perfil"
              ? "Nome profissional"
              : "Cidade atendida";
        await screen.findByLabelText(label);
        if (path.includes("?id="))
          expect(screen.getByLabelText(label)).toHaveDisplayValue(
            section === "Meus serviços" ? "Reparo elétrico" : "Araranguá",
          );
        await nativeBack();
      }
      await screen.findByRole("header", { name: section });
      await nativeBack();
      expect(
        await screen.findByRole("header", { name: "Meu espaço profissional" }),
      ).toBeTruthy();
      expect(screen).toHavePathname("/provider");
      expect(profile).toEqual(saved);
      expect(requests.filter((r) => r.method !== "GET")).toHaveLength(0);
    } finally {
      read.mockResolvedValue(null);
    }
  },
);

test("native back and dashboard dismissal both protect a dirty form until discard is confirmed", async () => {
  completeFixture();
  const saved = clone(profile);
  await providerEntry();
  await servicesList();
  await fireEvent.press(screen.getByText("Adicionar serviço"));
  await screen.findByLabelText("Título do serviço");
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Rascunho protegido",
  );
  await nativeBack();
  await fireEvent.press(await screen.findByText("Continuar editando"));
  expect(screen.getByLabelText("Título do serviço")).toHaveDisplayValue(
    "Rascunho protegido",
  );
  await act(async () => router.dismissTo("/provider"));
  await fireEvent.press(await screen.findByText("Descartar alterações"));
  expect(screen).toHavePathname("/provider");
  expect(
    await screen.findByRole("header", { name: "Meu espaço profissional" }),
  ).toBeTruthy();
  expect(screen).toHavePathname("/provider");
  expect(profile).toEqual(saved);
  expect(requests.filter((r) => r.method !== "GET")).toHaveLength(0);
});

test("continuing from the first service to coverage replaces the section so back after saving still reaches dashboard", async () => {
  await providerEntry();
  await fireEvent.press(
    await screen.findByRole("button", { name: "Adicionar serviço" }),
  );
  await fireEvent.press(
    await screen.findByRole("radio", { name: "Eletricista" }),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Título do serviço"),
    "Instalação de tomadas",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Salvar serviço" }));
  await fireEvent.press(await screen.findByText("Continuar: onde atendo"));
  await screen.findByLabelText("Cidade atendida");
  await fireEvent.press(screen.getByRole("button", { name: "Salvar área" }));
  await screen.findByText("Área de atendimento salva.");
  expect(screen).toHavePathname("/provider/areas");
  await nativeBack();
  await screen.findByRole("header", { name: "Meu espaço profissional" });
  expect(screen).toHavePathname("/provider");
  expect(profile.services).toHaveLength(1);
  expect(profile.areas).toHaveLength(1);
});

test("opening coverage from professional profile keeps native back pointed at the dashboard", async () => {
  completeFixture();
  await providerEntry();
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "Meu perfil. Concluído. Abrir etapa.",
    }),
  );
  await screen.findByRole("header", { name: "Meu perfil" });
  await fireEvent.press(screen.getByRole("button", { name: "Onde atendo" }));
  await screen.findByRole("header", { name: "Onde atendo" });
  await nativeBack();
  await screen.findByRole("header", { name: "Meu espaço profissional" });
  expect(screen).toHavePathname("/provider");
});

test("professional bottom navigation is unique, labelled and keeps the three approved dashboard steps", async () => {
  completeFixture();
  await providerEntry();
  expect(
    screen.getAllByLabelText("Navegação do espaço profissional"),
  ).toHaveLength(1);
  for (const name of ["Painel", "Solicitações", "Minha conta"])
    expect(screen.getAllByRole("button", { name })).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "Painel", selected: true }),
  ).toBeTruthy();
  for (const step of ["Meu perfil", "Meus serviços", "Onde atendo"])
    expect(
      await screen.findByRole("button", {
        name: `${step}. Concluído. Abrir etapa.`,
      }),
    ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Solicitações recebidas" }),
  ).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Meus serviços. Concluído. Abrir etapa.",
    }),
  );
  await screen.findByRole("header", { name: "Meus serviços" });
  expect(
    screen.getByRole("button", { name: "Painel", selected: true }),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Painel" }));
  await screen.findByRole("header", { name: "Meu espaço profissional" });
  expect(screen).toHavePathname("/provider");
});

test.each([
  {
    first: "Minha conta",
    second: "Solicitações",
    path: "/provider/requests",
    heading: "Solicitações recebidas",
  },
  {
    first: "Solicitações",
    second: "Minha conta",
    path: "/provider/account",
    heading: "Minha conta",
  },
])(
  "bottom navigation $first to $second preserves dashboard as native back destination",
  async ({ first, second, path, heading }) => {
    completeFixture();
    const saved = clone(profile);
    await providerEntry();
    await fireEvent.press(screen.getByRole("button", { name: first }));
    await screen.findByRole("button", { name: first, selected: true });
    await fireEvent.press(screen.getByRole("button", { name: second }));
    await screen.findByRole("header", { name: heading });
    expect(screen).toHavePathname(path);
    expect(
      screen.getByRole("button", { name: second, selected: true }),
    ).toBeTruthy();
    // Re-selecting the current item must not push another screen.
    await fireEvent.press(screen.getByRole("button", { name: second }));
    await nativeBack();
    await screen.findByRole("header", { name: "Meu espaço profissional" });
    expect(screen).toHavePathname("/provider");
    expect(profile).toEqual(saved);
    expect(requests.filter((r) => r.method !== "GET")).toHaveLength(0);
  },
);

test("all professional forms hide bottom navigation and restore it when canceled without losing stack hierarchy", async () => {
  completeFixture();
  await providerEntry();
  for (const item of [
    {
      section: "Meus serviços",
      open: "Adicionar serviço",
      label: "Título do serviço",
    },
    {
      section: "Meu perfil",
      open: "Editar meu perfil profissional",
      label: "Nome profissional",
    },
    {
      section: "Onde atendo",
      open: "Adicionar área",
      label: "Cidade atendida",
    },
  ]) {
    await fireEvent.press(
      await screen.findByRole("button", {
        name: `${item.section}. Concluído. Abrir etapa.`,
      }),
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: item.open }),
    );
    await screen.findByLabelText(item.label);
    expect(
      screen.queryByLabelText("Navegação do espaço profissional"),
    ).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Cancelar" }));
    await screen.findByRole("header", { name: item.section });
    expect(
      screen.getByLabelText("Navegação do espaço profissional"),
    ).toBeTruthy();
    await nativeBack();
    await screen.findByRole("header", { name: "Meu espaço profissional" });
  }
});

test("enlarged text on a narrow screen keeps every bottom destination available and functional", async () => {
  jest
    .spyOn(ReactNative, "useWindowDimensions")
    .mockReturnValue({ width: 320, height: 568, scale: 2, fontScale: 2 });
  await providerEntry();
  for (const name of ["Painel", "Solicitações", "Minha conta"])
    expect(screen.getByRole("button", { name })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Minha conta" }));
  await screen.findByRole("header", { name: "Minha conta" });
  expect(
    screen.queryByRole("button", { name: "Meu espaço profissional" }),
  ).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Painel" }));
  await screen.findByRole("header", { name: "Meu espaço profissional" });
  expect(screen).toHavePathname("/provider");
});

test("professional profile and public real catalog show empty reviews without invented scores or review requests", async () => {
  completeFixture();
  await providerEntry();
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "Meu perfil. Concluído. Abrir etapa.",
    }),
  );
  expect(
    await screen.findByRole("header", { name: "Avaliações" }),
  ).toBeTruthy();
  expect(screen.getByText("Ainda não há avaliações.")).toBeTruthy();
  expect(
    screen.getByText(
      "Depois de realizar serviços pelo Omini, seus clientes poderão avaliar seu atendimento.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/de 5 ·/)).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Minha conta" }));
  await fireEvent.press(
    await screen.findByRole("button", { name: "Mudar para cliente" }),
  );
  await screen.findByText("De que você precisa hoje?");
  await fireEvent.press(
    await screen.findByRole("button", { name: "Ver perfil de João Elétrica" }),
  );
  expect(
    await screen.findByRole("header", { name: "Avaliações" }),
  ).toBeTruthy();
  expect(screen.getByText("Ainda não há avaliações.")).toBeTruthy();
  expect(screen.queryByText(/de 5 ·/)).toBeNull();
  expect(requests.some((request) => /review|avaliac/i.test(request.path))).toBe(
    false,
  );
});
