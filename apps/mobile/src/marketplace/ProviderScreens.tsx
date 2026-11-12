import { ReviewsSection } from "../components/ReviewsSection";
import { Text, View } from "react-native";
import { router } from "expo-router";
import {
  ScreenContainer,
  PrimaryButton,
  TextButton,
  Feedback,
  ActionRow,
  EmptyState,
  ui,
} from "../components/ui";
import { useOwnProvider } from "./hooks";
import { RemoteStatus } from "./components";
import { ProviderHeader, StepRow } from "./provider/FlowUI";
import { ManagedItem } from "./provider/ManagedItem";
import { useProviderNotice } from "./provider/feedback";
export function ProviderGuest() {
  return (
    <ScreenContainer>
      <ProviderHeader title="Meu espaço profissional" topic="dashboard" />
      <EmptyState
        title="Entre para configurar seu perfil"
        description="Use sua conta para ativar o perfil de prestador e cadastrar os dados reais."
      />
      <PrimaryButton
        title="Entrar na minha conta"
        onPress={() => router.push("/login")}
      />
    </ScreenContainer>
  );
}
export function ProviderDashboard() {
  const result = useOwnProvider();
  const profile = result.data;
  const hasProfile = !!profile && profile.professionalName.trim().length >= 2;
  const hasServices = !!profile?.services.some(
    (s) => s.isActive && s.category.isActive,
  );
  const hasAreas = !!profile?.areas.some((a) => a.isActive);
  // Same visibility requirements as the existing API; bio is optional.
  const visible = !!profile?.isActive && hasServices && hasAreas;
  const next = !hasProfile
    ? {
        title: "Editar meu perfil profissional",
        path: "/provider/profile/edit" as const,
      }
    : !hasServices
      ? profile?.services.length
        ? {
            title: "Revisar meus serviços",
            path: "/provider/services" as const,
          }
        : {
            title: "Adicionar serviço",
            path: "/provider/services/edit" as const,
          }
      : !hasAreas
        ? profile?.areas.length
          ? {
              title: "Revisar onde atendo",
              path: "/provider/areas" as const,
            }
          : {
              title: "Informar onde atendo",
              path: "/provider/areas/edit" as const,
            }
        : null;
  return (
    <ScreenContainer>
      <ProviderHeader
        title="Meu espaço profissional"
        subtitle="Configure seu cadastro para aparecer na busca."
        topic="dashboard"
      />
      <RemoteStatus {...result} />
      {profile && (
        <>
          {visible ? (
            <View style={ui.darkCard}>
              <Text
                accessibilityLiveRegion="polite"
                style={[ui.section, ui.onDark]}
              >
                Seu cadastro está visível para clientes
              </Text>
            </View>
          ) : (
            next && (
              <PrimaryButton
                title={next.title}
                onPress={() => router.push(next.path, { withAnchor: true })}
              />
            )
          )}
          <View style={ui.group}>
            <StepRow
              title="Meu perfil"
              description="Seu nome e apresentação."
              complete={hasProfile}
              icon="person-outline"
              onPress={() => router.push("/provider/profile")}
            />
            <StepRow
              title="Meus serviços"
              description="Os serviços que você oferece."
              complete={hasServices}
              icon="construct-outline"
              onPress={() => router.push("/provider/services")}
            />
            <StepRow
              title="Onde atendo"
              description="As cidades e os bairros atendidos."
              complete={hasAreas}
              icon="location-outline"
              onPress={() => router.push("/provider/areas")}
            />
          </View>
        </>
      )}
    </ScreenContainer>
  );
}
export function ProviderProfileOverview() {
  const result = useOwnProvider();
  const notice = useProviderNotice("profile");
  return (
    <ScreenContainer>
      <ProviderHeader
        title="Meu perfil"
        subtitle="As informações que os clientes veem."
        topic="profile"
        back
        onBack={() => router.dismissTo("/provider")}
      />
      <RemoteStatus {...result} />
      {!!notice.message && <Feedback message={notice.message} error={false} />}
      {result.data && (
        <>
          <View style={ui.card}>
            <Text style={ui.section}>{result.data.professionalName}</Text>
            <Text style={ui.text}>
              {result.data.bio
                ? "Apresentação cadastrada."
                : "Você pode adicionar uma apresentação, se quiser."}
            </Text>
          </View>
          <PrimaryButton
            title="Editar meu perfil profissional"
            onPress={() =>
              router.push("/provider/profile/edit", { withAnchor: true })
            }
          />
          <ReviewsSection />
        </>
      )}
      <ActionRow
        title="Onde atendo"
        description="Cidades e bairros atendidos"
        icon="location-outline"
        onPress={() => router.replace("/provider/areas", { withAnchor: true })}
      />
    </ScreenContainer>
  );
}
export function ProviderServices() {
  const result = useOwnProvider();
  const notice = useProviderNotice("services");
  return (
    <ScreenContainer>
      <ProviderHeader
        title="Meus serviços"
        topic="services"
        back
        onBack={() => router.dismissTo("/provider")}
      />
      <PrimaryButton
        title="Adicionar serviço"
        disabled={!result.data}
        onPress={() => {
          notice.clear();
          router.push("/provider/services/edit", { withAnchor: true });
        }}
      />
      {!!notice.message && <Feedback message={notice.message} error={false} />}
      <RemoteStatus {...result} />
      {notice.message === "Serviço salvo." &&
        result.data &&
        result.data.services.some(
          (service) => service.isActive && service.category.isActive,
        ) &&
        !result.data.areas.some((area) => area.isActive) && (
          <TextButton
            title="Continuar: onde atendo"
            onPress={() =>
              router.replace(
                result.data!.areas.length
                  ? "/provider/areas"
                  : "/provider/areas/edit",
                { withAnchor: true },
              )
            }
          />
        )}
      {result.data && (
        <>
          {!result.data.services.length && (
            <EmptyState
              title="Seu primeiro serviço começa aqui"
              description={
                'Toque em "Adicionar serviço". Por exemplo: Instalação de tomadas.'
              }
              icon="construct-outline"
            />
          )}
          {result.data.services.map((service) => (
            <ManagedItem
              key={service.id}
              kind="service"
              name={service.title}
              description={
                service.category.name +
                (!service.category.isActive ? " · categoria indisponível" : "")
              }
              active={service.isActive}
              onEdit={() => {
                notice.clear();
                router.push({
                  pathname: "/provider/services/edit",
                  params: { id: service.id },
                });
              }}
              onToggle={() =>
                result.api.updateService(service.id, {
                  isActive: !service.isActive,
                })
              }
              onChanged={(message) => {
                notice.success("services", message);
                result.reload();
              }}
            />
          ))}
        </>
      )}
    </ScreenContainer>
  );
}
export function ProviderAreas() {
  const result = useOwnProvider();
  const notice = useProviderNotice("areas");
  return (
    <ScreenContainer>
      <ProviderHeader
        title="Onde atendo"
        subtitle="Informe as cidades e os bairros atendidos."
        topic="areas"
        onBack={() => router.dismissTo("/provider")}
        back
      />
      <PrimaryButton
        title="Adicionar área"
        disabled={!result.data}
        onPress={() => {
          notice.clear();
          router.push("/provider/areas/edit", { withAnchor: true });
        }}
      />
      {!!notice.message && <Feedback message={notice.message} error={false} />}
      <RemoteStatus {...result} />
      {result.data && (
        <>
          {!result.data.areas.length && (
            <EmptyState
              title="Onde você pode ajudar?"
              description="Adicione uma cidade. Se atender toda a cidade, deixe o bairro em branco."
              icon="location-outline"
            />
          )}
          {result.data.areas.map((area) => (
            <ManagedItem
              key={area.id}
              kind="area"
              name={`${area.city}/${area.state}`}
              description={area.neighborhood || "Toda a cidade"}
              active={area.isActive}
              onEdit={() => {
                notice.clear();
                router.push({
                  pathname: "/provider/areas/edit",
                  params: { id: area.id },
                });
              }}
              onToggle={() =>
                result.api.updateArea(area.id, { isActive: !area.isActive })
              }
              onChanged={(message) => {
                notice.success("areas", message);
                result.reload();
              }}
            />
          ))}
        </>
      )}
    </ScreenContainer>
  );
}
