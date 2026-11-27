import { useState, useEffect, useCallback, useRef } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { ref, onValue } from "firebase/database";
import { auth, rtdb } from "../firebase/firebaseConfig";
import {
  signInWithGitHub,
  completeRedirectSignIn,
  isRedirectSignInPending,
  signOutUser,
  claimUsername,
  getStoredGitHubToken,
  clearStoredGitHubToken,
  updateUserGitHubVerification,
  syncPublicProfile,
  describeAuthError,
  type GitHubSignInResult
} from "../firebase/authService";
import {
  ENABLE_GITHUB_VERIFICATION_GATE,
  verifyAllGitHubRequirements,
  followCreator,
  followOrg,
  starRepository,
  starAllMissingRepositories
} from "../firebase/githubVerificationService";
import type { UserProfile, VerificationStatus } from "../firebase/types";
import { tGlobal } from "../i18n";

/** Stop reporting "loading" when the profile cannot be fetched (e.g. offline at startup). */
const PROFILE_LOAD_TIMEOUT_MS = 10000;

type ProfileStatus = "idle" | "loading" | "missing" | "ready" | "error";

export interface UseAuthReturn {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  /** True until the session and the signed-in user's profile are resolved; gate deep links on it. */
  isLoadingAuth: boolean;
  needsUsernameOnboarding: boolean;
  isSigningIn: boolean;
  /** Last user-facing sign-in or profile error, or null. */
  authError: string | null;
  dismissAuthError: () => void;
  githubToken: string | null;
  verificationStatus: VerificationStatus | null;
  isVerifying: boolean;
  showVerificationModal: boolean;
  setShowVerificationModal: (show: boolean) => void;
  /** Never rejects; failures land in `authError`. Concurrent calls share one sign-in. */
  loginWithGitHub: () => Promise<void>;
  logout: () => Promise<void>;
  completeUsernameOnboarding: (rawUsername: string) => Promise<UserProfile>;
  refreshProfile: () => Promise<void>;
  checkVerification: () => Promise<VerificationStatus>;
  followCreatorHandler: () => Promise<boolean>;
  followOrgHandler: () => Promise<boolean>;
  starRepoHandler: (repoFullName: string) => Promise<boolean>;
  starAllHandler: () => Promise<{ success: number; failed: number }>;
  autoVerifyHandler: () => Promise<boolean>;
}

function isSameProfile(a: UserProfile | null, b: UserProfile | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const left = a as unknown as Record<string, unknown>;
  const right = b as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

export function useAuth(): UseAuthReturn {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("idle");
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  const signInRef = useRef<Promise<void> | null>(null);
  const syncedUidRef = useRef<string | null>(null);
  /** Bumped per verification run and per account change; stale results are dropped. */
  const verifyRunRef = useRef(0);
  const verifyInFlightRef = useRef<Promise<VerificationStatus> | null>(null);
  /** Open the verification modal after the first check that follows an interactive sign-in. */
  const promptVerificationRef = useRef(false);
  const userProfileRef = useRef<UserProfile | null>(null);
  userProfileRef.current = userProfile;

  /** Keeps the profile object identity stable when nothing changed (consumers key effects on it). */
  const setUserProfile = useCallback((next: UserProfile | null) => {
    setUserProfileState((prev) => (isSameProfile(prev, next) ? prev : next));
  }, []);

  const reportAuthError = useCallback((err: unknown) => {
    const message = describeAuthError(err);
    if (!message) return;
    console.warn("[useAuth] GitHub sign-in failed:", err);
    setAuthError(message);
  }, []);

  const applySignInResult = useCallback(
    (result: GitHubSignInResult) => {
      setCurrentUser(result.user);
      if (result.githubToken) setGithubToken(result.githubToken);
      if (result.profile) {
        setUserProfile(result.profile);
        setProfileStatus("ready");
      }
      promptVerificationRef.current = ENABLE_GITHUB_VERIFICATION_GATE && Boolean(result.profile);
    },
    [setUserProfile]
  );

  // Session restore (works offline from local persistence) and account switches.
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      verifyRunRef.current++;
      verifyInFlightRef.current = null;
      setIsVerifying(false);
      setVerificationStatus(null);
      setCurrentUser(user);
      setGithubToken(getStoredGitHubToken(user?.uid));
      setUserProfileState((prev) => (prev && user && prev.uid === user.uid ? prev : null));
      if (!user) {
        // Also covers sign-outs from another tab, which never run signOutUser here.
        clearStoredGitHubToken();
        syncedUidRef.current = null;
        setProfileStatus("idle");
        setShowVerificationModal(false);
        setIsLoadingAuth(false);
      }
    });
  }, []);

  // Finish a redirect sign-in (popup fallback) started before this page load.
  useEffect(() => {
    if (!isRedirectSignInPending()) return;
    setIsSigningIn(true);
    completeRedirectSignIn()
      .then((result) => {
        if (result) {
          applySignInResult(result);
        } else if (!auth.currentUser) {
          // The redirect was abandoned, or the browser dropped the auth state (third-party
          // storage blocking). Say so instead of failing silently.
          setAuthError(tGlobal("auth.redirectIncomplete"));
        }
      })
      .catch(reportAuthError)
      .finally(() => setIsSigningIn(false));
  }, [applySignInResult, reportAuthError]);

  // Live profile of the signed-in user. Read failures never route to onboarding.
  const uid = currentUser?.uid || null;
  useEffect(() => {
    if (!uid) return;
    // A profile already applied for this account (e.g. by the sign-in itself) stays usable.
    const hasProfile = userProfileRef.current?.uid === uid;
    setIsLoadingAuth(!hasProfile);
    setProfileStatus(hasProfile ? "ready" : "loading");

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) setIsLoadingAuth(false);
    }, PROFILE_LOAD_TIMEOUT_MS);

    const unsubscribe = onValue(
      ref(rtdb, `users/${uid}`),
      (snap) => {
        settled = true;
        const stored = snap.exists() ? (snap.val() as UserProfile) : null;
        if (stored?.username) {
          const profile: UserProfile = { ...stored, uid, email: auth.currentUser?.email || stored.email || "" };
          setUserProfile(profile);
          setProfileStatus("ready");
          if (syncedUidRef.current !== uid) {
            syncedUidRef.current = uid;
            void syncPublicProfile(profile, stored.email !== undefined);
          }
        } else {
          setUserProfile(null);
          setProfileStatus("missing");
        }
        setIsLoadingAuth(false);
      },
      (error) => {
        settled = true;
        // Signing out revokes this listener before the effect cleanup runs: not an error.
        if (auth.currentUser?.uid !== uid) return;
        console.warn("[useAuth] Could not load the profile:", error);
        setProfileStatus("error");
        setAuthError(tGlobal("auth.profileLoadFailed"));
        setIsLoadingAuth(false);
      }
    );

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [uid, profileEpoch, setUserProfile]);

  const githubLogin = userProfile?.githubUsername || "";
  const checkVerification = useCallback(async (): Promise<VerificationStatus> => {
    if (!ENABLE_GITHUB_VERIFICATION_GATE) {
      // Gate off: bypass status without network calls or database writes.
      const status = await verifyAllGitHubRequirements("");
      setVerificationStatus(status);
      return status;
    }
    if (verifyInFlightRef.current) return verifyInFlightRef.current;

    const run = ++verifyRunRef.current;
    const verifiedUid = uid;
    setIsVerifying(true);

    const task = (async () => {
      const result = await verifyAllGitHubRequirements(githubLogin, githubToken || undefined);
      if (run !== verifyRunRef.current) return result;
      setVerificationStatus(result);

      if (promptVerificationRef.current) {
        promptVerificationRef.current = false;
        if (!result.isVerified && !result.error) setShowVerificationModal(true);
      }

      // Persist real outcomes only, and only when they changed: errors (rate limits, network)
      // never downgrade a stored state, and bypasses are never stored.
      const stored = userProfileRef.current;
      const missing = result.missingRepos.length;
      const changed =
        stored?.githubVerified !== result.isVerified ||
        stored?.isFollowingCreator !== result.isFollowingCreator ||
        stored?.missingReposCount !== missing;
      if (verifiedUid && !result.error && !result.isDevBypass && changed) {
        updateUserGitHubVerification(verifiedUid, result.isVerified, result.isFollowingCreator, missing).catch(
          (err) => console.warn("[useAuth] Could not store the verification result:", err)
        );
      }
      return result;
    })();

    verifyInFlightRef.current = task;
    try {
      return await task;
    } finally {
      if (verifyInFlightRef.current === task) verifyInFlightRef.current = null;
      if (run === verifyRunRef.current) setIsVerifying(false);
    }
  }, [uid, githubLogin, githubToken]);

  // Auto-verify once per loaded profile (only while the gate is enabled).
  useEffect(() => {
    if (ENABLE_GITHUB_VERIFICATION_GATE && userProfile?.username && !verificationStatus) {
      void checkVerification();
    }
  }, [userProfile?.username, verificationStatus, checkVerification]);

  const autoVerifyHandler = useCallback(async (): Promise<boolean> => {
    const status = await checkVerification();
    return status.isVerified;
  }, [checkVerification]);

  const loginWithGitHubHandler = useCallback((): Promise<void> => {
    if (signInRef.current) return signInRef.current;
    const task = (async () => {
      setIsSigningIn(true);
      setAuthError(null);
      try {
        applySignInResult(await signInWithGitHub());
      } catch (err) {
        reportAuthError(err);
      } finally {
        setIsSigningIn(false);
        signInRef.current = null;
      }
    })();
    signInRef.current = task;
    return task;
  }, [applySignInResult, reportAuthError]);

  const logoutHandler = useCallback(async () => {
    verifyRunRef.current++;
    verifyInFlightRef.current = null;
    setShowVerificationModal(false);
    try {
      await signOutUser();
    } catch (err) {
      console.warn("[useAuth] Sign-out failed:", err);
      setAuthError(tGlobal("auth.signOutFailed"));
      return;
    }
    setGithubToken(null);
    setVerificationStatus(null);
    setCurrentUser(null);
    setUserProfileState(null);
    setProfileStatus("idle");
  }, []);

  const completeUsernameOnboarding = useCallback(
    async (rawUsername: string) => {
      if (!currentUser) {
        throw new Error(tGlobal("auth.mustBeLoggedIn"));
      }
      const profile = await claimUsername(currentUser, rawUsername);
      setUserProfile(profile);
      setProfileStatus("ready");
      return profile;
    },
    [currentUser, setUserProfile]
  );

  const refreshProfile = useCallback(async () => {
    setAuthError(null);
    setProfileEpoch((epoch) => epoch + 1);
  }, []);

  const dismissAuthError = useCallback(() => setAuthError(null), []);

  const followCreatorHandler = useCallback(() => followCreator(), []);
  const followOrgHandler = useCallback(() => followOrg(), []);
  const starRepoHandler = useCallback((repoFullName: string) => starRepository(repoFullName), []);

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
    // Never during a sign-in (the profile is being provisioned) and never after a failed read.
    needsUsernameOnboarding: Boolean(currentUser) && profileStatus === "missing" && !isSigningIn,
    isSigningIn,
    authError,
    dismissAuthError,
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
