/**
 * create-post.tsx — thin redirect to the canonical post composer.
 * Preserves the `prefill` param used by the chat "share AI result" flow.
 */
import { Redirect, useLocalSearchParams } from "expo-router";

export default function CreatePostRedirect() {
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const href = prefill
    ? ({ pathname: "/moments/create", params: { prefill } } as any)
    : "/moments/create";
  return <Redirect href={href} />;
}
