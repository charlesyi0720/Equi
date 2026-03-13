/**
 * Supabase Authentication Utilities
 * Handles login, signup, session management
 */

import { supabase, supabaseAdmin } from "./supabase";
import { EquiUser } from "../types";

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export interface ProfileData {
  id: string;
  user_data: EquiUser | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string): Promise<{
  user: AuthUser | null;
  error: string | null;
}> {
  if (!supabase) {
    return { user: null, error: "Supabase not initialized" };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/equi/onboarding`,
      },
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (data.user) {
      // Profile is now created automatically via database trigger
      // Just log for debugging
      console.log("[AUTH] Signup successful for user:", data.user.id);
    }

    return { user: data.user as AuthUser, error: null };
  } catch (err) {
    return { user: null, error: "An unexpected error occurred" };
  }
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<{
  user: AuthUser | null;
  error: string | null;
}> {
  if (!supabase) {
    return { user: null, error: "Supabase not initialized" };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    return { user: data.user as AuthUser, error: null };
  } catch (err) {
    return { user: null, error: "An unexpected error occurred" };
  }
}

/**
 * Sign out
 */
export async function signOut(): Promise<{ error: string | null }> {
  if (!supabase) {
    return { error: "Supabase not initialized" };
  }

  try {
    const { error } = await supabase.auth.signOut();
    return { error: error?.message || null };
  } catch (err) {
    return { error: "An unexpected error occurred" };
  }
}

/**
 * Get current session
 */
export async function getSession() {
  console.log("[AUTH] getSession called");
  if (!supabase) {
    console.log("[AUTH] getSession: Supabase not initialized");
    return { session: null, error: "Supabase not initialized" };
  }

  try {
    console.log("[AUTH] getSession: calling supabase.auth.getSession()");
    const { data: { session }, error } = await supabase.auth.getSession();
    console.log("[AUTH] getSession result:", { hasSession: !!session, userId: session?.user?.id, error });
    return { session, error: error?.message || null };
  } catch (err) {
    console.log("[AUTH] getSession exception:", err);
    return { session: null, error: "An unexpected error occurred" };
  }
}

/**
 * Get current user
 */
export async function getUser() {
  if (!supabase) {
    console.log("[AUTH DEBUG] getUser: Supabase not initialized");
    return { user: null, error: "Supabase not initialized" };
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    console.log("[AUTH DEBUG] getUser result:", { 
      hasUser: !!user, 
      userId: user?.id, 
      error 
    });
    return { user: user as AuthUser | null, error: error?.message || null };
  } catch (err) {
    console.log("[AUTH DEBUG] getUser exception:", err);
    return { user: null, error: "An unexpected error occurred" };
  }
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  if (!supabase) {
    return { data: null };
  }

  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return subscription;
}

/**
 * Create profile entry for new user
 */
async function createProfile(userId: string, email: string): Promise<boolean> {
  console.log("[AUTH DEBUG] createProfile called with:", { userId, email, hasAdmin: !!supabaseAdmin });
  
  if (!supabaseAdmin) {
    console.error("[AUTH] Admin client not initialized - missing SUPABASE_SERVICE_ROLE_KEY");
    // Fallback to regular client
    if (!supabase) {
      console.error("[AUTH] No supabase client at all");
      return false;
    }
    
    try {
      const { error } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email,
          user_data: null,
          onboarding_completed: false,
        });

      if (error) {
        console.error("[AUTH DEBUG] Fallback insert failed:", error);
        return false;
      }

      console.log("[AUTH DEBUG] Profile created via fallback for user:", userId);
      return true;
    } catch (err) {
      console.error("[AUTH DEBUG] Fallback exception:", err);
      return false;
    }
  }

  try {
    const { error } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        email,
        user_data: null,
        onboarding_completed: false,
      });

    if (error) {
      console.error("[AUTH DEBUG] Admin insert failed:", error);
      return false;
    }

    console.log("[AUTH DEBUG] Profile created via admin for user:", userId);
    return true;
  } catch (err) {
    console.error("[AUTH] Unexpected error creating profile:", err);
    return false;
  }
}

/**
 * Get user profile from database
 */
export async function getProfile(userId: string): Promise<{
  profile: ProfileData | null;
  error: string | null;
}> {
  console.log("[AUTH] getProfile START, userId:", userId);
  console.log("[AUTH] getProfile, supabaseAdmin exists:", !!supabaseAdmin, "supabase exists:", !!supabase);

  if (!supabaseAdmin) {
    // Fallback to regular client if admin not available
    if (!supabase) {
      console.log("[AUTH DEBUG] getProfile: No supabase client at all");
      return { profile: null, error: "Supabase not initialized" };
    }

    try {
      console.log("[AUTH DEBUG] getProfile: Using regular client to fetch profile for:", userId);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      console.log("[AUTH DEBUG] getProfile regular client result:", { data, error: error?.message });

      // If profile doesn't exist, return null (don't block)
      if (error && error.code === 'PGRST116') {
        console.log("[AUTH DEBUG] getProfile: Profile not found, returning null");
        return { profile: null, error: null };
      }

      if (error) {
        return { profile: null, error: error.message };
      }

      return { profile: data as ProfileData, error: null };
    } catch (err) {
      console.log("[AUTH DEBUG] getProfile exception:", err);
      return { profile: null, error: "An unexpected error occurred" };
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    console.log("[AUTH DEBUG] getProfile admin result:", { hasData: !!data, error: error?.message });

    // If profile doesn't exist, return null (don't block)
    if (error && error.code === 'PGRST116') {
      console.log("[AUTH DEBUG] getProfile: Profile not found, returning null");
      return { profile: null, error: null };
    }

    if (error) {
      return { profile: null, error: error.message };
    }

    return { profile: data as ProfileData, error: null };
  } catch (err) {
    return { profile: null, error: "An unexpected error occurred" };
  }
}

/**
 * Update user profile
 */
export async function updateProfile(userId: string, updates: {
  user_data?: EquiUser;
  onboarding_completed?: boolean;
}): Promise<{ error: string | null }> {
  if (!supabaseAdmin) {
    if (!supabase) {
      return { error: "Supabase not initialized" };
    }
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      
      return { error: error?.message || null };
    } catch (err) {
      return { error: "An unexpected error occurred" };
    }
  }

  try {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    return { error: error?.message || null };
  } catch (err) {
    return { error: "An unexpected error occurred" };
  }
}

/**
 * Check if user has completed onboarding
 */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    console.log("[AUTH DEBUG] hasCompletedOnboarding checking for:", userId);
    
    // Increase timeout to 15 seconds
    const profilePromise = getProfile(userId);
    const profileTimeout = new Promise<{ profile: null, error: null }>((resolve) =>
      setTimeout(() => resolve({ profile: null, error: null }), 15000)
    );
    
    const { profile, error } = await Promise.race([profilePromise, profileTimeout]) as any;

    console.log("[AUTH DEBUG] hasCompletedOnboarding result:", {
      profile: profile ? "exists" : null,
      error,
      completed: profile?.onboarding_completed,
      isTimeout: !profile && !error
    });

    // If timed out, treat as completed (user has data but query is slow)
    if (!profile && !error) {
      console.log("[AUTH DEBUG] hasCompletedOnboarding timed out, assuming completed");
      return true;
    }

    if (error || !profile) {
      console.log("[AUTH DEBUG] hasCompletedOnboarding returning false due to error or no profile");
      return false;
    }

    const result = profile.onboarding_completed === true;
    console.log("[AUTH DEBUG] hasCompletedOnboarding returning:", result);
    return result;
  } catch (err) {
    console.log("[AUTH DEBUG] hasCompletedOnboarding exception:", err);
    return false;
  }
}

/**
 * Redirect to appropriate page based on auth state
 */
export async function getRedirectPath(): Promise<{
  path: string;
  reason: "login" | "onboarding" | "dashboard";
}> {
  const { user, error: userError } = await getUser();
  
  if (userError || !user) {
    return { path: "/equi/login", reason: "login" };
  }
  
  const completed = await hasCompletedOnboarding(user.id);
  
  if (completed) {
    return { path: "/equi/dashboard", reason: "dashboard" };
  }
  
  return { path: "/equi/onboarding", reason: "onboarding" };
}
