import { Suspense } from "react";
import ResetPasswordForm from "./_components/ResetPasswordForm";

export const metadata = {
  title: "Reset Password – Duolync",
};

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
