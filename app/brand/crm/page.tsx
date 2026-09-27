"use client";

import BrandCRM from "@/pages/brand/BrandCRM";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

export default function BrandCRMPage() {
  return (
    <ProtectedRoute requiredType="brand">
      <BrandCRM />
    </ProtectedRoute>
  );
}
