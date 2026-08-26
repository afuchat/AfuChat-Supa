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
import { ScrollView, View, useWindowDimensions } from "react-native";

const PagerView = React.forwardRef(function PagerView(
  { children, style, initialPage = 0, onPageSelected, onPageScroll, scrollEnabled = true, ...rest },
  ref
) {
  const pages = React.Children.toArray(children);
  const { width } = useWindowDimensions();
  const [page, setPageState] = React.useState(() => {
    const max = Math.max(0, pages.length - 1);
    return Math.max(0, Math.min(initialPage, max));
  });
  const onPageSelectedRef = React.useRef(onPageSelected);
  onPageSelectedRef.current = onPageSelected;
  const onPageScrollRef = React.useRef(onPageScroll);
  onPageScrollRef.current = onPageScroll;
  const scrollRef = React.useRef(null);

  React.useImperativeHandle(ref, () => ({
    setPage(index) {
      const max = Math.max(0, pages.length - 1);
      const next = Math.max(0, Math.min(index, max));
      setPageState(next);
      scrollRef.current?.scrollTo({ x: width * next, animated: true });
    },
  }));

  React.useEffect(() => {
    onPageSelectedRef.current?.({ nativeEvent: { position: page } });
  }, [page]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      scrollEnabled={scrollEnabled}
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      style={[{ flex: 1, overflow: "hidden" }, style]}
      contentContainerStyle={{ width: width * pages.length, flexGrow: 1 }}
      onScroll={(event) => {
        const x = event.nativeEvent.contentOffset.x;
        const rawPage = width > 0 ? x / width : 0;
        const position = Math.max(0, Math.min(pages.length - 1, Math.floor(rawPage)));
        onPageScrollRef.current?.({
          nativeEvent: { position, offset: Math.max(0, Math.min(1, rawPage - position)) },
        });
      }}
      onMomentumScrollEnd={(event) => {
        const next = width > 0
          ? Math.max(0, Math.min(pages.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)))
          : 0;
        setPageState(next);
      }}
      {...rest}
    >
      {pages.map((child, index) => (
        <View key={index} style={{ width, flex: 1 }}>
          {child}
        </View>
      ))}
    </ScrollView>
  );
});

PagerView.displayName = "PagerView";
export default PagerView;
export { PagerView };
