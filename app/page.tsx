"use client";

import { useEffect, useState } from "react";
import { getSession, hasCompletedOnboarding } from "./equi/lib/auth";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSessionAndRedirect = async () => {
      try {
        const { session } = await getSession();
        
        if (!session) {
          router.push("/equi/login");
          return;
        }

        const completed = await hasCompletedOnboarding(session.user.id);
        
        if (completed) {
          router.push("/equi/dashboard");
        } else {
          router.push("/equi/onboarding");
        }
      } catch (err) {
        console.error("[ROOT] Error checking session:", err);
        router.push("/equi/login");
      } finally {
        setLoading(false);
      }
    };

    checkSessionAndRedirect();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fff] flex items-center justify-center">
        <div className="text-xs uppercase tracking-widest text-[#666]">Loading...</div>
      </div>
    );
  }

  return null;
}
