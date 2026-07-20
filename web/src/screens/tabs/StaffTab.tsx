import React from 'react';

// Desktop also hid a sticky header on this page via webview.insertCSS(). Same
// limitation as PosTab.tsx — a cross-origin iframe can't have CSS injected into it
// from the parent. If the duplicate header is visually noisy, ask pos.psx.ng/staff
// to hide it itself when embedded (window.self !== window.top).
export default function StaffTab() {
  return (
    <iframe
      src="https://pos.psx.ng/staff"
      title="PharmaStackX Staff Management"
      className="w-full h-full border-0"
    />
  );
}
