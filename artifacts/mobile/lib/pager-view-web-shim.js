/**
 * Web stub for react-native-pager-view.
 * On web, pager-view imports RN internals (codegenNativeCommands → ReactFabric)
 * which Metro cannot bundle for the web platform. This shim replaces the entire
 * package with a simple ScrollView-based container so the app shell can render.
 */
import React from "react";
import { View } from "react-native";

function PagerView({ children, style, initialPage = 0, onPageSelected, ...rest }) {
  const pages = React.Children.toArray(children);
  const [page, setPage] = React.useState(initialPage);

  React.useEffect(() => {
    onPageSelected?.({ nativeEvent: { position: page } });
  }, [page]);

  return (
    <View style={[{ flex: 1, overflow: "hidden" }, style]} {...rest}>
      {pages[page] ?? null}
    </View>
  );
}

PagerView.displayName = "PagerView";
export default PagerView;
export { PagerView };
