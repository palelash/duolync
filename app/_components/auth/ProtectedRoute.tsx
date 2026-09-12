"use client";
import { useAuth } from "@/hooks/useAuth";
import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthHoldScreen } from "@/app/_components/auth/AuthHoldScreen";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Restrict to a specific user type — redirects away if role mismatch */
  requiredType?: "brand" | "creator";
}

const RedirectTo = ({ path }: { path: string }) => {
  const router = useRouter();

  useEffect(() => {
    router.replace(path);
  }, [path, router]);

  return null;
};

const ProtectedRoute = ({ children, requiredType }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();

  if (loading) return <AuthHoldScreen />;

  // Not authenticated → send to sign-in with callbackUrl preserved
  if (!user) return <RedirectTo path="/sign-in" />;

  const userType = profile?.user_type;

  // Role-based route guard: wrong type → send to own dashboard.
  // Admin users are redirected to /admin to break the self-referential loop that
  // would otherwise occur: ProtectedRoute on /creator/dashboard would redirect
  // "admin" userType back to /creator/dashboard (since it isn't "brand" either),
  // creating an infinite redirect cycle.
  if (requiredType && userType && userType !== requiredType) {
    const destination =
      userType === "admin"
        ? "/admin"
        : userType === "brand"
        ? "/brand/dashboard"
        : "/creator/dashboard";
    return <RedirectTo path={destination} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
