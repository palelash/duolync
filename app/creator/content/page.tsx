"use client";

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ContentPage from "./_components/ContentPage";

export default function Page() {
  return (
    <ProtectedRoute requiredType="creator">
      <ContentPage />
    </ProtectedRoute>
  );
}
