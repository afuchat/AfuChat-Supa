import AppPageShell from "@/components/superapp/AppPageShell";
import AfuPayApp from "@/modules/afupay";

export default function WalletPage() {
  return <AppPageShell appId="afupay"><AfuPayApp /></AppPageShell>;
}
