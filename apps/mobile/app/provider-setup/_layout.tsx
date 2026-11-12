import { Slot } from "expo-router";
import { PrivateProviderScreen } from "../../src/marketplace/provider/PrivateScreen";
export default function LegacyProviderLayout() {
  return (
    <PrivateProviderScreen>
      <Slot />
    </PrivateProviderScreen>
  );
}
