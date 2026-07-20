import React from 'react';

// Desktop used an Electron <webview> pointed at the same URL (see
// Synkk/src/renderer/screens/GeneralDashboardTab.tsx). In a browser that becomes
// a plain iframe — the SSO cookie set at login (see lib/auth.ts) is shared because
// this app and www.psx.ng are both under the .psx.ng domain.
export default function PsxWebTab() {
  return (
    <iframe
      src="https://www.psx.ng"
      title="PharmaStackX Web"
      className="w-full h-full border-0"
    />
  );
}
