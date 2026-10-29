import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: "#111111",
          border: "1px solid #222222",
          color: "#F5F5F5",
        },
      }}
    />
  );
}
