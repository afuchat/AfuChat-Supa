/**
 * create-post.tsx — thin redirect to the canonical post composer.
 * Preserves the `prefill` param used by the chat "share AI result" flow.
 */
import { Redirect, useLocalSearchParams } from "expo-router";

export default function CreatePostRedirect() {
  const { prefill, imageUrl } = useLocalSearchParams<{ prefill?: string; imageUrl?: string }>();
  const params: Record<string, string> = {};
  if (prefill)  params.prefill  = prefill;
  if (imageUrl) params.imageUrl = imageUrl;
  const href = Object.keys(params).length > 0
    ? ({ pathname: "/moments/create", params } as any)
    : "/moments/create";
  return <Redirect href={href} />;
}
