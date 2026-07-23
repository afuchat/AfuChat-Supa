import { useWindowDimensions } from "react-native";

export function useIsDesktop() {
  const { width, height } = useWindowDimensions();
  return { isDesktop: false, width, height };
}
