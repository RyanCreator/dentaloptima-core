import { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  action?: ReactNode;
}

export const SectionHeader = ({ title, action }: SectionHeaderProps) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      {action}
    </div>
  );
};
