import { ReactNode } from "react";

interface InfoCardProps {
  children: ReactNode;
  className?: string;
}

export const InfoCard = ({ children, className = "" }: InfoCardProps) => {
  return (
    <div className={`bg-card rounded-lg border p-6 space-y-4 ${className}`}>
      {children}
    </div>
  );
};

interface InfoCardSectionProps {
  title?: string;
  children: ReactNode;
}

export const InfoCardSection = ({ title, children }: InfoCardSectionProps) => {
  return (
    <div className="space-y-3 text-sm">
      {title && <h3 className="font-semibold text-base">{title}</h3>}
      {children}
    </div>
  );
};
