import Demo from "../../src/demo/screens/Home";
import { CatalogHome } from "../../src/marketplace/CatalogScreens";
import { useMode } from "../../src/mode";
export default function Screen() {
  const { catalogSource } = useMode();
  return catalogSource === "demo" ? <Demo /> : <CatalogHome />;
}
