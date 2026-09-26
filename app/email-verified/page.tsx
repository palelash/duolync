import { Suspense } from "react";
import EmailVerifiedClient from "./_components/EmailVerifiedClient";

export const metadata = {
  title: "Email Verified – Duolync",
};

export default function EmailVerifiedPage() {
  return (
    <Suspense>
      <EmailVerifiedClient />
    </Suspense>
  );
}
