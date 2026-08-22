import { Easing } from "react-native";

export const CHAT_FAST_DURATION = 180;
export const CHAT_FAST_EASING = Easing.out(Easing.cubic);
export const CHAT_FAST_SPRING = {
  speed: 24,
  bounciness: 0,
  useNativeDriver: true,
} as const;