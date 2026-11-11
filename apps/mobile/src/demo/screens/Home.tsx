import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import {
  ScreenContainer,
  Header,
  DemoNotice,
  ActionRow,
  ProfessionalCard,
  ServiceCategoryCard,
  SectionHeading,
  ui,
} from "../../components/ui";
import { categories, professionals } from "../../demo/catalog";
import { theme } from "../../theme";
export default function Home() {
  return (
    <ScreenContainer>
      <Header
        title="De que você precisa hoje?"
        subtitle="Serviços para simplificar o seu dia."
      />
      <ActionRow
        title="Buscar um profissional"
        description="Explore nomes, serviços e bairros"
        icon="search-outline"
        onPress={() => router.push("/client/search")}
      />
      <View style={ui.darkCard}>
        <View style={[ui.row, { justifyContent: "space-between" }]}>
          <Text
            style={[ui.label, { color: theme.colors.accent, flexShrink: 1 }]}
          >
            MENOS PREOCUPAÇÃO. MAIS VIDA.
          </Text>
          <Ionicons
            name="sparkles-outline"
            size={28}
            color={theme.colors.accent}
          />
        </View>
        <Text style={[ui.title, ui.onDark, { fontSize: 27, lineHeight: 34 }]}>
          Sua casa em boas mãos.
        </Text>
        <Text style={[ui.small, ui.onDarkMuted]}>
          Conheça o catálogo de exemplo e descubra as especialidades do Omini.
        </Text>
      </View>
      <View style={ui.group}>
        <SectionHeading
          title="Categorias"
          action="Ver todas"
          onPress={() => router.push("/client/categories")}
        />
        <View style={ui.grid}>
          {categories.slice(0, 4).map((category) => (
            <ServiceCategoryCard
              key={category.id}
              category={category}
              onPress={() =>
                router.push({
                  pathname: "/client/search",
                  params: { category: category.id },
                })
              }
            />
          ))}
        </View>
      </View>
      <View style={ui.group}>
        <SectionHeading
          title="Profissionais de exemplo"
          action="Explorar"
          onPress={() => router.push("/client/search")}
        />
        {professionals.slice(0, 2).map((p) => (
          <ProfessionalCard key={p.id} professional={p} />
        ))}
      </View>
      <DemoNotice />
    </ScreenContainer>
  );
}
