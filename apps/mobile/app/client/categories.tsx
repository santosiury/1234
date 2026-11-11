import Demo from "../../src/demo/screens/Categories";
import { CatalogCategories } from "../../src/marketplace/CatalogScreens";
import { useMode } from "../../src/mode";
export default function Screen() {
  const { catalogSource } = useMode();
  return catalogSource === "demo" ? <Demo /> : <CatalogCategories />;
}
