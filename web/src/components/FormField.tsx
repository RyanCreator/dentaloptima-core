import { ReactNode, ReactElement, cloneElement, useId } from "react";
import { Label } from "@/components/ui/label";

interface FormFieldProps {
  label: string;
  children: ReactNode;
  helpText?: string;
  error?: string;
  required?: boolean;
}

export const FormField = ({ label, children, helpText, error, required }: FormFieldProps) => {
  const id = useId();
  const inputId = `input-${id}`;
  const helpTextId = helpText ? `help-${id}` : undefined;
  const errorId = error ? `error-${id}` : undefined;

  // Build aria-describedby string
  const describedBy = [helpTextId, errorId].filter(Boolean).join(" ");

  // Clone the child input element and add accessibility attributes
  const enhancedChildren = typeof children === "object" && children !== null && "type" in children
    ? cloneElement(children as ReactElement, {
        id: inputId,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })
    : children;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {enhancedChildren}
      {helpText && (
        <p id={helpTextId} className="text-xs text-muted-foreground">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

interface FormFieldGroupProps {
  children: ReactNode;
  columns?: number;
}

export const FormFieldGroup = ({ children, columns = 2 }: FormFieldGroupProps) => {
  return (
    <div className={`grid gap-3 ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
      {children}
    </div>
  );
};
