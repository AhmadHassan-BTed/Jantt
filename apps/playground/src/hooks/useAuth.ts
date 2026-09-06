import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
import {
  signInWithGoogle,
  signOutUser,
  getUserProfile,
  claimUsername
} from "../firebase/authService";
import type { UserProfile } from "../firebase/types";

export interface UseAuthReturn {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoadingAuth: boolean;
  needsUsernameOnboarding: boolean;
  isSigningIn: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  completeUsernameOnboarding: (rawUsername: string) => Promise<UserProfile>;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [needsUsernameOnboarding, setNeedsUsernameOnboarding] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const fetchProfile = useCallback(async (user: FirebaseUser | null) => {
    if (!user) {
      setUserProfile(null);
      setNeedsUsernameOnboarding(false);
      return;
    }
    try {
      const profile = await getUserProfile(user.uid);
      if (profile && profile.username) {
        setUserProfile(profile);
        setNeedsUsernameOnboarding(false);
      } else {
        setUserProfile(null);
        setNeedsUsernameOnboarding(true);
      }
    } catch {
      // In case of network/first load issue
      setNeedsUsernameOnboarding(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      await fetchProfile(user);
      setIsLoadingAuth(false);
    });

    return () => unsubscribe();
  }, [fetchProfile]);

  const loginWithGoogleHandler = useCallback(async () => {
    setIsSigningIn(true);
    try {
      const user = await signInWithGoogle();
      await fetchProfile(user);
    } finally {
      setIsSigningIn(false);
    }
  }, [fetchProfile]);

  const logoutHandler = useCallback(async () => {
    await signOutUser();
    setCurrentUser(null);
    setUserProfile(null);
    setNeedsUsernameOnboarding(false);
  }, []);

  const completeUsernameOnboarding = useCallback(
    async (rawUsername: string) => {
      if (!currentUser) {
        throw new Error("Must be logged in to claim a username.");
      }
      const profile = await claimUsername(currentUser, rawUsername);
      setUserProfile(profile);
      setNeedsUsernameOnboarding(false);
      return profile;
    },
    [currentUser]
  );

  const refreshProfile = useCallback(async () => {
    if (currentUser) {
      await fetchProfile(currentUser);
    }
  }, [currentUser, fetchProfile]);

  return {
    currentUser,
    userProfile,
    isLoadingAuth,
    needsUsernameOnboarding,
    isSigningIn,
    loginWithGoogle: loginWithGoogleHandler,
    logout: logoutHandler,
    completeUsernameOnboarding,
    refreshProfile
  };
}
