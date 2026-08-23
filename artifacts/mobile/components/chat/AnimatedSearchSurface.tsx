import React, { useEffect, useRef } from "react";
import { Animated, Platform, ViewStyle } from "react-native";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export function AnimatedSearchSurface({ children, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: Platform.OS !== "web",
      damping: 18,
      stiffness: 190,
      mass: 0.75,
    }).start();
  }, [progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            { scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}