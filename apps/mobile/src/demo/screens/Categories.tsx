import { View } from "react-native";
import { router } from "expo-router";
import {
  ScreenContainer,
  Header,
  ServiceCategoryCard,
  DemoNotice,
  ui,
} from "../../components/ui";
import { categories } from "../../demo/catalog";
export default function Categories() {
  return (
    <ScreenContainer>
      <Header
        title="Todo tipo de ajuda"
        subtitle="Escolha uma especialidade para explorar os perfis fictícios."
      />
      <View style={ui.grid}>
        {categories.map((category) => (
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
      <DemoNotice />
    </ScreenContainer>
  );
}
