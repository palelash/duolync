import { Suspense } from "react";
import VerifyEmailNotification from "./_components/VerifyEmailNotification";

export const metadata = {
  title: "Verify your email – Duolync",
};

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailNotification />
    </Suspense>
  );
}
