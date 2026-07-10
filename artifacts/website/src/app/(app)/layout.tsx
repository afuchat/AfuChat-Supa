import { AuthProvider } from "../../contexts/AuthContext";
import Sidebar from "../../components/Sidebar";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex h-screen w-full bg-[#f5f6f8]">
        <Sidebar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </AuthProvider>
  );
}
