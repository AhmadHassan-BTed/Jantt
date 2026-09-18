import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";
import {
  signInWithGitHub,
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
  followOrg,
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
  logout: () => void;
  completeUsernameOnboarding: (rawUsername: string) => Promise<UserProfile>;
  refreshProfile: () => Promise<void>;
  checkVerification: () => Promise<VerificationStatus>;
  followCreatorHandler: () => Promise<boolean>;
  followOrgHandler: () => Promise<boolean>;
  starRepoHandler: (repoFullName: string) => Promise<boolean>;
  starAllHandler: () => Promise<{ success: number; failed: number }>;
  autoVerifyHandler: () => Promise<boolean>;
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

  const autoVerifyHandler = useCallback(async (): Promise<boolean> => {
    const status = await checkVerification();
    return status.isVerified;
  }, [checkVerification]);

  const loginWithGitHubHandler = useCallback(async () => {
    setIsSigningIn(true);
    try {
      const { profile, githubToken: token } = await signInWithGitHub();
      if (token) setGithubToken(token);
      setUserProfile(profile);
      setNeedsUsernameOnboarding(false);

      // Verify requirements upon login via read-only check
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
    await followCreator();
    return true;
  }, []);

  const followOrgHandler = useCallback(async (): Promise<boolean> => {
    await followOrg();
    return true;
  }, []);

  const starRepoHandler = useCallback(
    async (repoFullName: string): Promise<boolean> => {
      await starRepository(repoFullName);
      return true;
    },
    []
  );

  const starAllHandler = useCallback(async (): Promise<{
    success: number;
    failed: number;
  }> => {
    if (!verificationStatus?.missingRepos?.length) {
      return { success: 0, failed: 0 };
    }
    return starAllMissingRepositories(verificationStatus.missingRepos);
  }, [verificationStatus?.missingRepos]);

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
    logout: logoutHandler,
    completeUsernameOnboarding,
    refreshProfile,
    checkVerification,
    followCreatorHandler,
    followOrgHandler,
    starRepoHandler,
    starAllHandler,
    autoVerifyHandler
  };
}
