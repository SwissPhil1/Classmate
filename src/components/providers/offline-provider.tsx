"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerServiceWorker, syncPendingWrites, isOnline } from "@/lib/offline";
import { WifiOff } from "lucide-react";

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [showInstall, setShowInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const supabase = createClient();

  useEffect(() => {
    registerServiceWorker();
    setOnline(isOnline());

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Handle sync events
    const handleSync = async () => {
      if (isOnline()) {
        const { synced } = await syncPendingWrites(supabase);
        if (synced > 0) {
          setLastSync(new Date());
        }
      }
    };

    window.addEventListener("radloop:sync", handleSync);

    // Handle PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show install prompt on first mobile visit
      if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
        setShowInstall(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("radloop:sync", handleSync);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      setShowInstall(false);
      setDeferredPrompt(null);
    }
  };

  return (
    <>
      {children}

      {/* Offline banner */}
      {!online && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber/90 text-black px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
          <WifiOff className="w-4 h-4" />
          <span>Mode hors-ligne — les données seront synchronisées à la reconnexion</span>
          {lastSync && (
            <span className="text-xs font-normal opacity-75">
              · Sync. {Math.floor((Date.now() - lastSync.getTime()) / 60000)}m
            </span>
          )}
        </div>
      )}

      {/* Install prompt */}
      {showInstall && (
        <div className="fixed bottom-20 left-4 right-4 z-[100] bg-card border border-border rounded-xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Installer RadLoop
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Accédez à l'app directement depuis l'écran d'accueil
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowInstall(false)}
                className="text-xs text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-background"
              >
                Plus tard
              </button>
              <button
                onClick={handleInstall}
                className="text-xs text-white bg-teal px-3 py-1.5 rounded-lg hover:bg-teal-light"
              >
                Installer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Type for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}
