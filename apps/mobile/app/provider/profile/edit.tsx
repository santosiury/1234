import { ProfileFormScreen } from "../../../src/marketplace/provider/Forms";
import { PrivateProviderScreen } from "../../../src/marketplace/provider/PrivateScreen";
export default function EditScreen() {
  return (
    <PrivateProviderScreen>
      <ProfileFormScreen />
    </PrivateProviderScreen>
  );
}
