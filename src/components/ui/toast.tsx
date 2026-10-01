"use client";

import { useCallback, createContext, useContext } from "react";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";

type ToastType = "success" | "error" | "info";

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  const { toast } = useContext(ToastContext);
  return { showToast: toast };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toast = useCallback((message: string, type: ToastType = "info") => {
    if (type === "success") sonnerToast.success(message);
    else if (type === "error") sonnerToast.error(message);
    else sonnerToast(message);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <SonnerToaster
        position="bottom-right"
        offset={20}
        gap={10}
        duration={3200}
        visibleToasts={4}
        closeButton
        theme="dark"
        toastOptions={{
          classNames: {
            toast:
              "group !rounded-xl !border !border-border !bg-elevated/90 !text-foreground !shadow-2xl !backdrop-blur-xl",
            title: "!text-sm !font-medium",
            description: "!text-xs !text-muted-foreground",
            success: "!border-success/35 !bg-success/10",
            error: "!border-destructive/35 !bg-destructive/10",
            info: "!border-secondary/35 !bg-secondary/10",
            actionButton: "!bg-primary !text-primary-foreground !rounded-lg !text-xs !font-semibold",
            closeButton:
              "!border-border !bg-card !text-muted-foreground hover:!bg-accent hover:!text-foreground",
          },
        }}
      />
    </ToastContext.Provider>
  );
}