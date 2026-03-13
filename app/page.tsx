"use client";

import { useEffect, useState } from "react";
import { getSession, getProfile } from "./equi/lib/auth";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSessionAndRedirect = async () => {
      try {
        console.log("[ROOT] ===== Starting redirect logic =====");
        
        // Step 1: Get Session
        console.log("[ROOT] Step 1: Getting session...");
        const { session, error: sessionError } = await getSession();
        
        if (sessionError) {
          console.log("[ROOT] Session error:", sessionError);
        }
        
        console.log("[ROOT] User is logged in:", !!session);
        
        // Step 2: Not logged in -> Login
        if (!session) {
          console.log("[ROOT] Redirecting to: /equi/login (not logged in)");
          router.push("/equi/login");
          return;
        }

        // Step 3: Get Profile from DB (authoritative source)
        console.log("[ROOT] Step 2: Getting profile from DB...");
        console.log("[ROOT] User ID:", session.user.id);
        
        const { profile, error: profileError } = await getProfile(session.user.id);
        
        if (profileError) {
          console.log("[ROOT] Profile error:", profileError);
          setError(profileError);
        }
        
        console.log("[ROOT] Profile data:", profile ? {
          id: profile.id,
          onboarding_completed: profile.onboarding_completed,
          hasUserData: !!profile.user_data
        } : null);
        
        // Step 4: Smart redirect based on DB status
        const completed = profile?.onboarding_completed === true;
        console.log("[ROOT] Onboarding status from DB:", completed);
        
        if (completed) {
          console.log("[ROOT] ===== Redirecting to: /equi/dashboard (completed) =====");
          router.push("/equi/dashboard");
        } else {
          console.log("[ROOT] ===== Redirecting to: /equi/onboarding (not completed) =====");
          router.push("/equi/onboarding");
        }
      } catch (err) {
        console.error("[ROOT] Error in redirect logic:", err);
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

  // Show error if any
  if (error) {
    return (
      <div className="min-h-screen bg-[#fff] flex flex-col items-center justify-center gap-4">
        <div className="text-sm text-red-500">Error: {error}</div>
        <button 
          onClick={() => router.push("/equi/login")}
          className="text-xs underline text-[#666]"
        >
          Go to Login
        </button>
      </div>
    );
  }

  return null;
}
