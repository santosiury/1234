import { Text, View } from "react-native";
import { router } from "expo-router";
import {
  ScreenContainer,
  Header,
  DemoNotice,
  PrimaryButton,
  ProfessionalCard,
  ServiceCategoryCard,
  ui,
} from "../../src/components/ui";
import { categories, professionals } from "../../src/demo/catalog";
export default function Home() {
  return (
    <ScreenContainer>
      <Header
        title="De que você precisa hoje?"
        subtitle="Encontre cuidado e talento perto de você."
      />
      <DemoNotice />
      <PrimaryButton
        secondary
        title="Buscar um profissional"
        onPress={() => router.push("/client/search")}
      />
      <View style={ui.card}>
        <Text style={ui.label}>MAIS TEMPO PARA VOCÊ</Text>
        <Text style={ui.section}>Sua casa em boas mãos.</Text>
        <Text style={ui.text}>
          Explore especialidades e conheça como será encontrar ajuda no Omini.
        </Text>
      </View>
      <Text style={ui.section}>Comece por uma categoria</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
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
      <Text style={ui.section}>Conheça os perfis de exemplo</Text>
      {professionals.slice(0, 2).map((p) => (
        <ProfessionalCard key={p.id} professional={p} />
      ))}
    </ScreenContainer>
  );
}
