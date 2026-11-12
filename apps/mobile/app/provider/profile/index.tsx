import { Profile } from "../../../src/components/Profile";
import { ProviderProfileOverview } from "../../../src/marketplace/ProviderScreens";
import { useMode } from "../../../src/mode";
import { useSession } from "../../../src/auth/session";
export default function ProviderProfile() {
  const { catalogSource } = useMode();
  const { state } = useSession();
  return catalogSource === "real" && state.user ? (
    <ProviderProfileOverview key={state.user.id} />
  ) : (
    <Profile back />
  );
}
