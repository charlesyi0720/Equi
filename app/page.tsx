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
        console.log("[ROOT] Starting redirect logic...");
        
        const { session } = await getSession();
        
        console.log("[ROOT] User is logged in:", !!session);
        
        if (!session) {
          console.log("[ROOT] Redirecting to: /equi/login (not logged in)");
          router.push("/equi/login");
          return;
        }

        console.log("[ROOT] User ID:", session.user.id);
        
        const completed = await hasCompletedOnboarding(session.user.id);
        
        console.log("[ROOT] Onboarding status from DB:", completed);
        
        if (completed) {
          console.log("[ROOT] Redirecting to: /equi/dashboard (completed)");
          router.push("/equi/dashboard");
        } else {
          console.log("[ROOT] Redirecting to: /equi/onboarding (not completed)");
          router.push("/equi/onboarding");
        }
      } catch (err) {
        console.error("[ROOT] Error checking session:", err);
        console.log("[ROOT] Redirecting to: /equi/login (error)");
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
