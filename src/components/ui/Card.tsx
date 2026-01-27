import React from "react";
import { cn } from "../../lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className, ...props }) => {
  return (
    <div
      className={cn(
        "rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<CardProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div className={cn("mb-4", className)} {...props}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<CardProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <h3
      className={cn(
        "text-lg font-semibold text-[hsl(var(--card-foreground))]",
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<CardProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <p
      className={cn("text-sm text-[hsl(var(--muted-foreground))] mt-1", className)}
      {...props}
    >
      {children}
    </p>
  );
};

export const CardContent: React.FC<CardProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div className={cn("", className)} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<CardProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "mt-4 pt-4 border-t border-[hsl(var(--border))] flex items-center gap-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
