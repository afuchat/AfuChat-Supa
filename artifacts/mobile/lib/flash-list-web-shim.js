/**
 * Web stub for @shopify/flash-list.
 * flash-list 2.x uses native RecyclerView internals unavailable on web.
 * This shim re-exports a standard FlatList so the app renders correctly.
 */
import React from "react";
import { FlatList } from "react-native";

export const FlashList = React.forwardRef((props, ref) => (
  <FlatList ref={ref} {...props} />
));
FlashList.displayName = "FlashList";

export const MasonryFlashList = React.forwardRef((props, ref) => (
  <FlatList ref={ref} {...props} />
));
MasonryFlashList.displayName = "MasonryFlashList";

export function useCellRenderItem(args) {
  return args.renderItem;
}

export default FlashList;
