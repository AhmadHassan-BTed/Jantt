import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

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
  | "github_verification";

export interface ActiveModalState {
  type: ModalType;
  payload?: any;
}

export interface ModalContextValue {
  activeModal: ActiveModalState | null;
  openModal: (type: ModalType, payload?: any) => void;
  closeModal: () => void;
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

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  const isModalOpen = useCallback(
    (type: ModalType) => activeModal?.type === type,
    [activeModal]
  );

  return (
    <ModalContext.Provider value={{ activeModal, openModal, closeModal, isModalOpen }}>
      {children}
    </ModalContext.Provider>
  );
};

export function useModalRegistry(): ModalContextValue {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModalRegistry must be used within a ModalProvider");
  }
  return context;
}
