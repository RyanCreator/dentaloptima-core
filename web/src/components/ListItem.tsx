import { ReactNode } from "react";

interface ListItemProps {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export const ListItem = ({ onClick, children, className = "" }: ListItemProps) => {
  const baseClasses = "w-full p-4 hover:bg-muted/50 transition-colors text-left border-b last:border-b-0";
  
  if (onClick) {
    return (
      <button onClick={onClick} className={`${baseClasses} ${className}`}>
        {children}
      </button>
    );
  }
  
  return <div className={`${baseClasses} ${className}`}>{children}</div>;
};

interface ListItemGridProps {
  label: string;
  value: ReactNode;
  onClick?: () => void;
}

export const ListItemGrid = ({ label, value, onClick }: ListItemGridProps) => {
  return (
    <ListItem onClick={onClick}>
      <div className="grid grid-cols-[100px,1fr] items-center gap-3">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted-foreground truncate">{value}</span>
      </div>
    </ListItem>
  );
};

interface ListItemLabelValueProps {
  label: string;
  value: ReactNode;
}

export const ListItemLabelValue = ({ label, value }: ListItemLabelValueProps) => {
  return (
    <div className="grid grid-cols-[80px,1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  );
};
