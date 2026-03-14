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
  if (!supabase) {
    return { session: null, error: "Supabase not initialized" };
  }

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error: error?.message || null };
  } catch (err) {
    return { session: null, error: "An unexpected error occurred" };
  }
}

/**
 * Get current user
 */
export async function getUser() {
  console.log('[DEBUG] getUser called');
  console.log('[DEBUG] supabase available:', !!supabase);
  
  if (!supabase) {
    console.log('[DEBUG] getUser: supabase not initialized');
    return { user: null, error: "Supabase not initialized" };
  }

  try {
    console.log('[DEBUG] getUser: calling supabase.auth.getUser()');
    
    // Add timeout wrapper - increased to 30 seconds for slow connections
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout fetching user')), 30000)
    );
    
    const userPromise = supabase.auth.getUser();
    
    const result = await Promise.race([userPromise, timeoutPromise]) as any;
    const { data: { user }, error } = result;
    
    console.log('[DEBUG] getUser result:', { hasUser: !!user, error });
    return { user: user as AuthUser | null, error: error?.message || null };
  } catch (err: any) {
    console.log('[DEBUG] getUser exception:', err?.message || err);
    return { user: null, error: err?.message || "An unexpected error occurred" };
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
        console.error("Fallback insert failed:", error);
        return false;
      }

      return true;
    } catch (err) {
      console.error("Fallback exception:", err);
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
      console.error("Admin insert failed:", error);
      return false;
    }

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
  console.log('[DEBUG] getProfile called with userId:', userId);
  console.log('[DEBUG] supabaseAdmin available:', !!supabaseAdmin);
  console.log('[DEBUG] supabase available:', !!supabase);
  
  if (!supabaseAdmin) {
    // Fallback to regular client if admin not available
    if (!supabase) {
      console.log('[DEBUG] getProfile: Supabase not initialized at all');
      return { profile: null, error: "Supabase not initialized" };
    }

    try {
      console.log('[DEBUG] getProfile: Using regular client to query profiles');
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      console.log('[DEBUG] getProfile result:', { data, error });

      // If profile doesn't exist, return null (don't block)
      if (error && error.code === 'PGRST116') {
        console.log('[DEBUG] getProfile: Profile not found (PGRST116)');
        return { profile: null, error: null };
      }

      if (error) {
        console.log('[DEBUG] getProfile: Error:', error.message);
        return { profile: null, error: error.message };
      }

      console.log('[DEBUG] getProfile: Success, found profile');
      return { profile: data as ProfileData, error: null };
    } catch (err) {
      console.log('[DEBUG] getProfile: Exception:', err);
      return { profile: null, error: "An unexpected error occurred" };
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    // If profile doesn't exist, return null (don't block)
    if (error && error.code === 'PGRST116') {
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
    // Increase timeout to 15 seconds
    const profilePromise = getProfile(userId);
    const profileTimeout = new Promise<{ profile: null, error: null }>((resolve) =>
      setTimeout(() => resolve({ profile: null, error: null }), 15000)
    );
    
    const { profile, error } = await Promise.race([profilePromise, profileTimeout]) as any;

    // If timed out, treat as completed (user has data but query is slow)
    if (!profile && !error) {
      return true;
    }

    if (error || !profile) {
      return false;
    }

    return profile.onboarding_completed === true;
  } catch (err) {
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
