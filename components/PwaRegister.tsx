"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(
        registrations
          .filter((registration) => registration.active?.scriptURL.endsWith("/sw.js") || registration.installing?.scriptURL.endsWith("/sw.js") || registration.waiting?.scriptURL.endsWith("/sw.js"))
          .map((registration) => registration.unregister()),
      ));
      if ("caches" in window) {
        void caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("wfs-flowboard-")).map((key) => caches.delete(key))));
      }
      return;
    }

    const register = () => navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
