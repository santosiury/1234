import { Redirect, useLocalSearchParams } from "expo-router";
export default function LegacyProviderRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <Redirect
      withAnchor
      href={{ pathname: "/provider/services/edit", params: id ? { id } : {} }}
    />
  );
}
