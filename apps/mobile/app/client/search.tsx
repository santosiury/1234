import Demo from "../../src/demo/screens/Search";
import { CatalogSearch } from "../../src/marketplace/CatalogScreens";
import { useMode } from "../../src/mode";
export default function Screen() {
  const { catalogSource } = useMode();
  return catalogSource === "demo" ? <Demo /> : <CatalogSearch />;
}
