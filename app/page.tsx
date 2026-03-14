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
        // Step 1: Get Session
        const { session, error: sessionError } = await getSession();
        
        if (sessionError) {
          console.error("Session error:", sessionError);
        }
        
        // Step 2: Not logged in -> Login
        if (!session) {
          router.push("/equi/login");
          return;
        }

        // Step 3: Get Profile from DB (authoritative source)
        const { profile, error: profileError } = await getProfile(session.user.id);
        
        if (profileError) {
          setError(profileError);
        }
        
        // Step 4: Smart redirect based on DB status
        const completed = profile?.onboarding_completed === true;
        
        if (completed) {
          router.push("/equi/dashboard");
        } else {
          router.push("/equi/onboarding");
        }
      } catch (err) {
        console.error("Error in redirect logic:", err);
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
