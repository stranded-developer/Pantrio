import { Suspense, type ReactNode } from "react";
import { SettingsTabs } from "./tabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <Suspense>
        <SettingsTabs />
      </Suspense>
      {children}
    </div>
  );
}
