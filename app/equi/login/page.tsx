"use client";

import React, { useState, useEffect } from "react";
import { signIn, signUp, getSession, onAuthStateChange, hasCompletedOnboarding } from "../lib/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const router = useRouter();

  // Check for mode=signup query param
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("mode") === "signup") {
      setIsSignUp(true);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    
    const checkSession = async () => {
      try {
        console.log("[LOGIN] Checking session...");
        
        // Add timeout to prevent hanging
        const sessionPromise = getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Session check timeout")), 5000)
        );
        
        const { session } = await Promise.race([sessionPromise, timeoutPromise]) as any;
        console.log("[LOGIN] Session check result:", session ? "user found" : "no session");
        
        if (session) {
          console.log("[LOGIN] User id:", session.user.id);
          
          // Check onboarding - if timeout or error, assume completed to avoid blocking users
          const onboardingPromise = hasCompletedOnboarding(session.user.id);
          const onboardingTimeout = new Promise((resolve) => 
            setTimeout(() => resolve(true), 15000) // timeout = assume completed
          );
          const completed = await Promise.race([onboardingPromise, onboardingTimeout]) as boolean;
          
          console.log("[LOGIN] Onboarding completed:", completed);
          router.push(completed ? "/equi/dashboard" : "/equi/onboarding");
          return;
        }
      } catch (err) {
        console.error("[LOGIN] Error checking session:", err);
      }
      setIsCheckingAuth(false);
    };
    
    checkSession();

    const subscription = onAuthStateChange(async (event, session) => {
      console.log("[LOGIN] Auth state change:", event, session ? "with session" : "no session");
      if (event === "SIGNED_IN" && session) {
        try {
          const completed = await hasCompletedOnboarding(session.user.id);
          router.push(completed ? "/equi/dashboard" : "/equi/onboarding");
        } catch (err) {
          console.error("[LOGIN] Error in auth state change:", err);
        }
      }
    });

    return () => {
      if (subscription && 'unsubscribe' in subscription) {
        subscription.unsubscribe();
      }
    };
  }, [router]);

  // Show loading while checking auth
  if (!mounted || isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#fff] flex items-center justify-center">
        <div className="text-xs uppercase tracking-widest text-[#666]">Loading...</div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        const { user, error: signUpError } = await signUp(email, password);
        if (signUpError) {
          setError(signUpError);
        } else if (user) {
          router.push("/equi/onboarding");
        }
      } else {
        const { user, error: signInError } = await signIn(email, password);
        if (signInError) {
          setError(signInError);
        } else if (user) {
          const completed = await hasCompletedOnboarding(user.id);
          router.push(completed ? "/equi/dashboard" : "/equi/onboarding");
        }
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#fff] flex items-center justify-center">
        <div className="text-xs uppercase tracking-widest text-[#666]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fff] flex flex-col">
      <header className="px-6 py-6">
        <h1 className="text-xl font-light tracking-tight">EQUI</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-light tracking-tight">
              {isSignUp ? "Create account" : "Welcome back"}
            </h2>
            <p className="text-xs text-[#666] uppercase tracking-widest mt-2">
              {isSignUp ? "Start your journey" : "Sign in to continue"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                disabled={loading}
                className="w-full py-4 text-sm bg-transparent outline-none border-b border-[#ddd] focus:border-[#111] transition-colors placeholder:text-[#ccc]"
              />
            </div>

            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                disabled={loading}
                className="w-full py-4 text-sm bg-transparent outline-none border-b border-[#ddd] focus:border-[#111] transition-colors placeholder:text-[#ccc]"
              />
            </div>

            {isSignUp && (
              <div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  disabled={loading}
                  className="w-full py-4 text-sm bg-transparent outline-none border-b border-[#ddd] focus:border-[#111] transition-colors placeholder:text-[#ccc]"
                />
              </div>
            )}

            {error && (
              <div className="text-xs text-[#e11d48] py-2">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 text-sm uppercase tracking-widest bg-[#111] text-[#fff] hover:bg-[#333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : isSignUp ? "Sign Up" : "Login"}
            </button>
          </form>

          <div className="text-center mt-8">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              disabled={loading}
              className="text-xs text-[#666] hover:text-[#111] transition-colors disabled:opacity-50"
            >
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
              <span className="ml-1 underline">
                {isSignUp ? "Login" : "Sign Up"}
              </span>
            </button>
          </div>
        </div>
      </main>

      <footer className="px-6 py-6 text-center">
        <p className="text-[10px] text-[#999] uppercase tracking-widest">
          Beyond the Checklist
        </p>
      </footer>
    </div>
  );
}
