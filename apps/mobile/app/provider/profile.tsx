import { Profile } from "../../src/components/Profile";
import { ProviderProfileEditor } from "../../src/marketplace/ProviderScreens";
import { useMode } from "../../src/mode";
import { useSession } from "../../src/auth/session";
export default function ProviderProfile() {
  const { catalogSource } = useMode();
  const { state } = useSession();
  return (
    <Profile>
      {catalogSource === "real" && state.user ? (
        <ProviderProfileEditor key={state.user.id} />
      ) : null}
    </Profile>
  );
}
