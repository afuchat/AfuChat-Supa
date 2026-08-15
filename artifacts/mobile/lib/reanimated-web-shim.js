// No-op shim for react-native-reanimated on web (Expo dev preview only).
// The native Reanimated runtime is still used on iOS and Android.
const React = require("react");
const { View, Text, Image, ScrollView, FlatList } = require("react-native");

function createAnimatedComponent(Component) { return Component; }
function useSharedValue(init) { return { value: init }; }
function useAnimatedStyle(fn) { return {}; }
function withTiming(value) { return value; }
function withSpring(value) { return value; }
function withDelay(_, value) { return value; }
function runOnJS(fn) { return fn; }
function runOnUI(fn) { return fn; }
function interpolate(_, __, output) { return output[0]; }
function useAnimatedGestureHandler() { return {}; }
function useAnimatedScrollHandler() { return {}; }
function useAnimatedRef() { return { current: null }; }
function useDerivedValue(fn) { return { value: fn() }; }
function cancelAnimation() {}
function withRepeat(value) { return value; }
function withSequence(...values) { return values[0]; }

const Extrapolation = { CLAMP: "clamp" };
const Animated = {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  createAnimatedComponent,
};

module.exports = {
  default: { createAnimatedComponent },
  Animated,
  createAnimatedComponent,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  withSequence,
  runOnJS,
  runOnUI,
  interpolate,
  Extrapolation,
  useAnimatedGestureHandler,
  useAnimatedScrollHandler,
  useAnimatedRef,
  useDerivedValue,
  cancelAnimation,
};