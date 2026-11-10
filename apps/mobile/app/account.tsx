import { Redirect } from "expo-router";
import { Profile } from "../src/components/Profile";
import { useSession } from "../src/auth/session";
export default function Account() {
  const { state } = useSession();
  return state.user ? <Profile /> : <Redirect href="/login" />;
}
