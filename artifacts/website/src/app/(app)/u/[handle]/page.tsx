export const dynamic = "force-static";
export function generateStaticParams() { return []; }

import UserProfileClient from "./UserProfileClient";

export default async function UserProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <UserProfileClient handle={handle} />;
}
