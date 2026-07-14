import { Suspense } from "react";
import { AuthProvider } from "../../contexts/AuthContext";
import { AuthModalProvider } from "../../contexts/AuthModalContext";
import AuthSheet from "../../components/auth/AuthSheet";
import Sidebar from "../../components/Sidebar";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {/* Suspense needed because AuthModalProvider reads useSearchParams */}
      <Suspense>
        <AuthModalProvider>
          <div className="flex h-screen w-full bg-[#f5f6f8]">
            <Sidebar />
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
          <AuthSheet />
        </AuthModalProvider>
      </Suspense>
    </AuthProvider>
  );
}
