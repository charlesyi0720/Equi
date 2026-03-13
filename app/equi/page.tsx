"use client";

import { useEffect, useState } from "react";
import { getSession, getProfile, onAuthStateChange } from "./lib/auth";
import { useRouter } from "next/navigation";
import EquiOnboarding from "./onboarding/page";

export default function EquiPage() {
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { session } = await getSession();
        
        if (!session) {
          router.push("/equi/login");
          return;
        }

        const { profile } = await getProfile(session.user.id);
        const completed = profile?.onboarding_completed === true;

        if (completed) {
          router.push("/equi/dashboard");
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth check error:", err);
        router.push("/equi/login");
      }
    };

    checkAuth();

    const subscription = onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        router.push("/equi/login");
      }
    });

    return () => {
      if (subscription && 'unsubscribe' in subscription) {
        subscription.unsubscribe();
      }
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fff] flex items-center justify-center">
        <div className="text-xs uppercase tracking-widest text-[#666]">Loading...</div>
      </div>
    );
  }

  return <EquiOnboarding />;
}
