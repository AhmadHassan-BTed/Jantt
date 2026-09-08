import React from "react";
import {
  PromptModal,
  AddPlanModal,
  PlanManagerModal,
  PeopleTeamsModal,
  ShareModal,
  AutoSaveModal,
  VersionHistoryModal
} from "./index";
import {
  CloudRoomModal,
  UsernameOnboardingModal,
  ShareRoomModal,
  GitHubVerificationModal
} from "../cloud";
import type { JanttData } from "@jantt/core";

export interface ModalHostProps {
  showPromptModal: boolean;
  setShowPromptModal: (show: boolean) => void;

  project: any;
  ownedRooms: any[];
  sharedRooms: any[];
  auth: any;

  showPlanManagerModal: boolean;
  setShowPlanManagerModal: (show: boolean) => void;
  handleSelectProjectOrRoom: (id: string) => void;
  handleCreateCloudRoomFromData: (title: string, data: JanttData) => Promise<string | null>;
  handleDeleteCloudRoom: (roomId: string) => Promise<any>;
  handleLeaveCloudRoom: (roomId: string) => Promise<any>;
  handleOpenShareRoom: (roomId: string) => void;
  toast: any;

  people: any;
  editor: any;

  roomSync: any;
  viewport: any;

  sharing: any;
  sidebar: any;

  autoSave: any;

  vault: any;
  handleRestoreSnapshot: (snapshot: JanttData, reason: string) => void;

  showShareRoomModal: boolean;
  setShowShareRoomModal: (show: boolean) => void;
  shareModalRoomId: string | null;
}

export const ModalHost: React.FC<ModalHostProps> = ({
  showPromptModal,
  setShowPromptModal,
  project,
  ownedRooms,
  sharedRooms,
  auth,
  showPlanManagerModal,
  setShowPlanManagerModal,
  handleSelectProjectOrRoom,
  handleCreateCloudRoomFromData,
  handleDeleteCloudRoom,
  handleLeaveCloudRoom,
  handleOpenShareRoom,
  toast,
  people,
  editor,
  roomSync,
  viewport,
  sharing,
  sidebar,
  autoSave,
  vault,
  handleRestoreSnapshot,
  showShareRoomModal,
  setShowShareRoomModal,
  shareModalRoomId
}) => {
  return (
    <>
      <PromptModal
        showPromptModal={showPromptModal}
        setShowPromptModal={setShowPromptModal}
      />

      <AddPlanModal
        showAddPlanModal={project.showAddPlanModal}
        setShowAddPlanModal={project.setShowAddPlanModal}
        newPlanTitle={project.newPlanTitle}
        setNewPlanTitle={project.setNewPlanTitle}
        newPlanTemplateType={project.newPlanTemplateType}
        setNewPlanTemplateType={project.setNewPlanTemplateType}
        handleCreateNewPlan={project.handleCreateNewPlan}
        ownedRooms={ownedRooms}
        sharedRooms={sharedRooms}
        isLoggedIn={Boolean(auth.currentUser)}
        isGitHubVerified={Boolean(auth.userProfile?.githubVerified || auth.verificationStatus?.isVerified)}
        onLogin={auth.loginWithGitHub}
        onRequireVerification={() => auth.setShowVerificationModal(true)}
      />

      <PlanManagerModal
        show={showPlanManagerModal}
        setShow={setShowPlanManagerModal}
        activeProjectId={project.activeProjectId}
        customProjects={project.customProjects}
        ownedRooms={ownedRooms}
        sharedRooms={sharedRooms}
        userProfile={auth.userProfile}
        onSelectProject={handleSelectProjectOrRoom}
        onDeleteProject={project.handleDeleteProject}
        onDuplicateProject={project.handleDuplicateProject}
        onRenameProject={project.handleRenameProject}
        onCreateLocalCopy={project.handleCreateLocalCopyFromData}
        onPublishToCloud={handleCreateCloudRoomFromData}
        onDeleteCloudRoom={async (roomId) => {
          await handleDeleteCloudRoom(roomId);
        }}
        onLeaveCloudRoom={async (roomId) => {
          await handleLeaveCloudRoom(roomId);
        }}
        onOpenShareRoom={handleOpenShareRoom}
        onOpenAddPlanModal={project.handleOpenAddPlanModal}
        onCreateNewRoom={project.handleOpenAddPlanModal}
        onSignOut={async () => {
          await auth.logout();
          setShowPlanManagerModal(false);
          toast.showToast("Signed out.");
        }}
        onImportJsonFile={project.handleImportJsonFile}
        showToast={toast.showToast}
      />

      <PeopleTeamsModal
        showPeopleModal={people.showPeopleModal}
        setShowPeopleModal={people.setShowPeopleModal}
        peopleModalTab={people.peopleModalTab}
        setPeopleModalTab={people.setPeopleModalTab}
        effectivePeople={people.effectivePeople}
        people={people.people}
        teams={people.teams}
        parsedData={editor.parsedData}
        newPersonName={people.newPersonName}
        setNewPersonName={people.setNewPersonName}
        newPersonRole={people.newPersonRole}
        setNewPersonRole={people.setNewPersonRole}
        newPersonTeamId={people.newPersonTeamId}
        setNewPersonTeamId={people.setNewPersonTeamId}
        handleAddPerson={people.handleAddPerson}
        onAddRealTeammate={people.handleAddRealTeammate}
        handlePersistAllPeople={people.handlePersistAllPeople}
        handlePersistPerson={people.handlePersistPerson}
        handleRemovePerson={people.handleRemovePerson}
        newTeamName={people.newTeamName}
        setNewTeamName={people.setNewTeamName}
        newTeamColor={people.newTeamColor}
        setNewTeamColor={people.setNewTeamColor}
        newTeamDesc={people.newTeamDesc}
        setNewTeamDesc={people.setNewTeamDesc}
        handleAddTeam={people.handleAddTeam}
        handleRemoveTeam={people.handleRemoveTeam}
      />

      <CloudRoomModal
        showModal={roomSync.showRoomModal}
        setShowModal={roomSync.setShowRoomModal}
        activeProject={project.activeProject}
        activeView={viewport.activeView}
        selectedThemeId={viewport.selectedThemeId}
        onCreateRoom={roomSync.handleCreateRoom}
        onJoinRoom={roomSync.handleJoinRoom}
        onUnlockCollaborator={roomSync.handleUnlockCollaborator}
        isProcessing={roomSync.isProcessing}
        activeRoomId={roomSync.activeRoomId}
        activeRoomRole={roomSync.activeRoomRole}
        activeSecretKey={roomSync.activeSecretKey}
        currentUserProfile={auth.userProfile}
      />

      <ShareModal
        showShareModal={sharing.showShareModal}
        setShowShareModal={sharing.setShowShareModal}
        currentProjectName={project.currentProjectName}
        parsedData={editor.parsedData}
        activeView={viewport.activeView}
        activeTheme={viewport.activeTheme}
        activeProject={project.activeProject}
        activeProjectId={project.activeProjectId}
        shareUrl={sharing.shareUrl}
        handleCopyShareLink={sharing.handleCopyShareLink}
        copiedShareLink={sharing.copiedShareLink}
        handleNativeShare={sharing.handleNativeShare}
        handleWhatsAppShare={sharing.handleWhatsAppShare}
        isWhatsAppSafe={sharing.isWhatsAppSafe}
        onOpenCloudRooms={() =>
          roomSync.activeRoomId
            ? handleOpenShareRoom(roomSync.activeRoomId)
            : setShowPlanManagerModal(true)
        }
        setIsSidebarCollapsed={sidebar.setIsSidebarCollapsed}
        handleDownloadJson={editor.handleDownloadJson}
        currentUserProfile={auth.userProfile}
        onCreateRoomFromActive={roomSync.createRoomFromActive}
        onOpenShareRoom={handleOpenShareRoom}
        onLogin={auth.loginWithGitHub}
        onOpenVerificationModal={() => auth.setShowVerificationModal(true)}
      />

      <AutoSaveModal
        showAutoSaveModal={autoSave.showAutoSaveModal}
        setShowAutoSaveModal={autoSave.setShowAutoSaveModal}
        saveStatus={autoSave.saveStatus}
        lastSavedAt={autoSave.lastSavedAt}
        handleManualSaveNow={autoSave.handleManualSaveNow}
        autoSaveInterval={autoSave.autoSaveInterval}
        setAutoSaveInterval={autoSave.setAutoSaveInterval}
        storageSizeKb={autoSave.storageSizeKb}
        onImportJson={() => project.fileInputRef.current?.click()}
        onExportJson={editor.handleDownloadJson}
        onExportCsv={editor.handleExportCsv}
      />

      <VersionHistoryModal
        showModal={vault.showVersionHistoryModal}
        setShowModal={vault.setShowVersionHistoryModal}
        snapshots={vault.snapshots}
        currentProjectName={project.currentProjectName}
        onRestoreSnapshot={handleRestoreSnapshot}
        onClearHistory={() => vault.clearSnapshots(project.activeProjectId)}
      />

      <UsernameOnboardingModal
        show={auth.needsUsernameOnboarding}
        currentUser={auth.currentUser}
        onClaimUsername={async (username: string) => {
          await auth.completeUsernameOnboarding(username);
          toast.showToast(`Username @${username} claimed! Welcome to Jantt Cloud.`);
        }}
      />

      <ShareRoomModal
        show={showShareRoomModal}
        setShow={setShowShareRoomModal}
        roomId={shareModalRoomId}
        roomTitle={
          ownedRooms.find((r) => r.roomId === shareModalRoomId)?.title ||
          sharedRooms.find((r) => r.roomId === shareModalRoomId)?.title ||
          project.customProjects.find((p: any) => p.roomId === shareModalRoomId)?.name ||
          "Project Room"
        }
        currentUserProfile={auth.userProfile}
        showToast={toast.showToast}
        planTeams={people.teams}
        planPeople={people.people}
        planTasksCount={editor.parsedData?.tasks?.length || 0}
        planNotesCount={editor.parsedData?.notes?.length || 0}
      />

      <GitHubVerificationModal
        show={auth.showVerificationModal}
        setShow={auth.setShowVerificationModal}
        verificationStatus={auth.verificationStatus}
        isVerifying={auth.isVerifying}
        onVerify={auth.checkVerification}
        onFollowCreator={auth.followCreatorHandler}
        onFollowOrg={auth.followOrgHandler}
        onStarRepo={auth.starRepoHandler}
        onStarAll={auth.starAllHandler}
        onAutoVerify={auth.autoVerifyHandler}
        githubUsername={auth.userProfile?.githubUsername || auth.userProfile?.username}
        hasGithubToken={Boolean(auth.githubToken)}
      />
    </>
  );
};
