import React from "react";
import { WorkspaceNav, WorkspaceSection } from "./WorkspaceNav";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  activeSection: WorkspaceSection;
  onNavigate: (section: WorkspaceSection) => void;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  children,
  activeSection,
  onNavigate,
}) => {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Level 1: Sidebar Navigation */}
      <WorkspaceNav activeSection={activeSection} onNavigate={onNavigate} />

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
};

export default WorkspaceLayout;
