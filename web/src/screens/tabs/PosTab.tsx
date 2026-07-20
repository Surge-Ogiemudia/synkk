import React from 'react';

// Desktop's Electron <webview> called setZoomFactor(0.85) here to force pos.psx.ng
// into its side-by-side layout (see Synkk/src/renderer/screens/PosTab.tsx). Electron
// webviews can reach into their content regardless of origin; a standard cross-origin
// <iframe> cannot — the browser blocks a parent page from zooming or injecting CSS
// into cross-origin iframe content, full stop. So this ships without that trick.
// If the embedded layout looks cramped, the real fix is for pos.psx.ng to detect
// window.self !== window.top and apply its own compact/embedded layout, not a hack
// from this side.
export default function PosTab() {
  return (
    <iframe
      src="https://pos.psx.ng"
      title="PharmaStackX POS"
      className="w-full h-full border-0"
    />
  );
}
