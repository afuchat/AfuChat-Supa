/**
 * Web stub for react-native-pager-view.
 * On web, pager-view imports RN internals (codegenNativeCommands → ReactFabric)
 * which Metro cannot bundle for the web platform. This shim replaces the entire
 * package with a simple View-based container so the app shell can render.
 *
 * Exposes setPage() via useImperativeHandle so callers like discover.tsx can
 * programmatically switch pages without crashing on web.
 */
import React from "react";
import { View } from "react-native";

const PagerView = React.forwardRef(function PagerView(
  { children, style, initialPage = 0, onPageSelected, ...rest },
  ref
) {
  const pages = React.Children.toArray(children);
  const [page, setPageState] = React.useState(initialPage);

  React.useImperativeHandle(ref, () => ({
    setPage(index) {
      setPageState(index);
    },
  }));

  React.useEffect(() => {
    onPageSelected?.({ nativeEvent: { position: page } });
  }, [page]);

  return (
    <View style={[{ flex: 1, overflow: "hidden" }, style]} {...rest}>
      {pages[page] ?? null}
    </View>
  );
});

PagerView.displayName = "PagerView";
export default PagerView;
export { PagerView };
