import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

export type ModalType =
  | "prompt"
  | "add_plan"
  | "plan_manager"
  | "people_teams"
  | "cloud_room"
  | "share_plan"
  | "autosave"
  | "version_history"
  | "username_onboarding"
  | "share_room"
  | "github_verification"
  | "read_only_fork"
  | "editor_login"
  | "command_palette"
  | "shortcuts";

export interface ActiveModalState {
  type: ModalType;
  payload?: any;
}

export interface ModalContextValue {
  activeModal: ActiveModalState | null;
  /** Opens a dialog, replacing any dialog that is already open (exactly one at a time). */
  openModal: (type: ModalType, payload?: any) => void;
  /** Closes the active dialog. With `type`, closes only if that dialog is the active one. */
  closeModal: (type?: ModalType) => void;
  isModalOpen: (type: ModalType) => boolean;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const [activeModal, setActiveModal] = useState<ActiveModalState | null>(null);

  const openModal = useCallback((type: ModalType, payload?: any) => {
    setActiveModal({ type, payload });
  }, []);

  const closeModal = useCallback((type?: ModalType) => {
    setActiveModal((prev) => (!type || prev?.type === type ? null : prev));
  }, []);

  const isModalOpen = useCallback(
    (type: ModalType) => activeModal?.type === type,
    [activeModal]
  );

  const value = useMemo<ModalContextValue>(
    () => ({ activeModal, openModal, closeModal, isModalOpen }),
    [activeModal, openModal, closeModal, isModalOpen]
  );

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
};

export function useModalRegistry(): ModalContextValue {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModalRegistry must be used within a ModalProvider");
  }
  return context;
}
