import { Redirect, useLocalSearchParams } from "expo-router";
export default function LegacyProviderRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <Redirect
      withAnchor
      href={{ pathname: "/provider/areas", params: id ? { id } : {} }}
    />
  );
}
