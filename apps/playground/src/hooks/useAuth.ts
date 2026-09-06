import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
import {
  signInWithGitHub,
  signInWithGoogle,
  signOutUser,
  getUserProfile,
  claimUsername,
  getStoredGitHubToken,
  clearStoredGitHubToken,
  updateUserGitHubVerification
} from "../firebase/authService";
import {
  verifyAllGitHubRequirements,
  followCreator,
  starRepository,
  starAllMissingRepositories
} from "../firebase/githubVerificationService";
import type { UserProfile, VerificationStatus } from "../firebase/types";

export interface UseAuthReturn {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoadingAuth: boolean;
  needsUsernameOnboarding: boolean;
  isSigningIn: boolean;
  githubToken: string | null;
  verificationStatus: VerificationStatus | null;
  isVerifying: boolean;
  showVerificationModal: boolean;
  setShowVerificationModal: (show: boolean) => void;
  loginWithGitHub: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  completeUsernameOnboarding: (rawUsername: string) => Promise<UserProfile>;
  refreshProfile: () => Promise<void>;
  checkVerification: () => Promise<VerificationStatus>;
  followCreatorHandler: () => Promise<boolean>;
  starRepoHandler: (repoFullName: string) => Promise<boolean>;
  starAllHandler: () => Promise<{ success: number; failed: number }>;
}

export function useAuth(): UseAuthReturn {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [needsUsernameOnboarding, setNeedsUsernameOnboarding] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [githubToken, setGithubToken] = useState<string | null>(getStoredGitHubToken);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  const fetchProfile = useCallback(async (user: FirebaseUser | null) => {
    if (!user) {
      setUserProfile(null);
      setNeedsUsernameOnboarding(false);
      setVerificationStatus(null);
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

  const checkVerification = useCallback(
    async (): Promise<VerificationStatus> => {
      const username = userProfile?.githubUsername || userProfile?.username || "";
      const token = githubToken || getStoredGitHubToken() || undefined;

      setIsVerifying(true);
      try {
        const result = await verifyAllGitHubRequirements(username, token);
        setVerificationStatus(result);

        if (currentUser?.uid) {
          await updateUserGitHubVerification(
            currentUser.uid,
            result.isVerified,
            result.isFollowingCreator,
            result.missingRepos.length,
            result.isDevBypass
          );

          setUserProfile((prev) =>
            prev
              ? {
                  ...prev,
                  githubVerified: result.isVerified,
                  isFollowingCreator: result.isFollowingCreator,
                  missingReposCount: result.missingRepos.length,
                  isDevBypass: result.isDevBypass,
                  lastVerifiedAt: new Date().toISOString()
                }
              : prev
          );
        }

        return result;
      } finally {
        setIsVerifying(false);
      }
    },
    [currentUser?.uid, githubToken, userProfile?.githubUsername, userProfile?.username]
  );

  // Auto-verify on login once profile is loaded
  useEffect(() => {
    if (userProfile?.username && !verificationStatus) {
      checkVerification();
    }
  }, [userProfile?.username, verificationStatus, checkVerification]);

  const loginWithGitHubHandler = useCallback(async () => {
    setIsSigningIn(true);
    try {
      const { profile, githubToken: token } = await signInWithGitHub();
      if (token) setGithubToken(token);
      setUserProfile(profile);
      setNeedsUsernameOnboarding(false);

      // Verify requirements immediately upon login
      const status = await verifyAllGitHubRequirements(
        profile.githubUsername || profile.username,
        token || undefined
      );
      setVerificationStatus(status);

      if (!status.isVerified) {
        setShowVerificationModal(true);
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

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
    clearStoredGitHubToken();
    setGithubToken(null);
    setVerificationStatus(null);
    setShowVerificationModal(false);
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

  const followCreatorHandler = useCallback(async (): Promise<boolean> => {
    const token = githubToken || getStoredGitHubToken();
    if (!token) return false;
    const ok = await followCreator(token);
    if (ok) {
      await checkVerification();
    }
    return ok;
  }, [githubToken, checkVerification]);

  const starRepoHandler = useCallback(
    async (repoFullName: string): Promise<boolean> => {
      const token = githubToken || getStoredGitHubToken();
      if (!token) return false;
      const ok = await starRepository(repoFullName, token);
      if (ok) {
        await checkVerification();
      }
      return ok;
    },
    [githubToken, checkVerification]
  );

  const starAllHandler = useCallback(async (): Promise<{
    success: number;
    failed: number;
  }> => {
    const token = githubToken || getStoredGitHubToken();
    if (!token || !verificationStatus?.missingRepos?.length) {
      return { success: 0, failed: 0 };
    }
    setIsVerifying(true);
    try {
      const res = await starAllMissingRepositories(
        verificationStatus.missingRepos,
        token
      );
      await checkVerification();
      return res;
    } finally {
      setIsVerifying(false);
    }
  }, [githubToken, verificationStatus?.missingRepos, checkVerification]);

  return {
    currentUser,
    userProfile,
    isLoadingAuth,
    needsUsernameOnboarding,
    isSigningIn,
    githubToken,
    verificationStatus,
    isVerifying,
    showVerificationModal,
    setShowVerificationModal,
    loginWithGitHub: loginWithGitHubHandler,
    loginWithGoogle: loginWithGoogleHandler,
    logout: logoutHandler,
    completeUsernameOnboarding,
    refreshProfile,
    checkVerification,
    followCreatorHandler,
    starRepoHandler,
    starAllHandler
  };
}
