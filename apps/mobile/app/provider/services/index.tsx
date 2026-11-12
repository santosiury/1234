import Demo from "../../../src/demo/screens/Services";
import {
  ProviderServices,
  ProviderGuest,
} from "../../../src/marketplace/ProviderScreens";
import { useMode } from "../../../src/mode";
import { useSession } from "../../../src/auth/session";
export default function Screen() {
  const { catalogSource } = useMode();
  const { state } = useSession();
  return catalogSource === "demo" ? (
    <Demo />
  ) : state.user ? (
    <ProviderServices key={state.user.id} />
  ) : (
    <ProviderGuest />
  );
}
