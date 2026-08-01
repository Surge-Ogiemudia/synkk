import React, { useState } from 'react';
import { X, Settings } from 'lucide-react';
import { updateTerminalModules, type TerminalModules } from '@/lib/api';

const MODULE_LABELS: { key: keyof TerminalModules; label: string }[] = [
  { key: 'psxWeb', label: 'PSX Web' },
  { key: 'pos', label: 'POS Register' },
  { key: 'emr', label: 'EMR Terminal' },
  { key: 'dispensary', label: 'Dispensary' },
  { key: 'orders', label: 'Online Orders & Leads' },
  { key: 'source', label: 'Source' },
  { key: 'staff', label: 'Staff Management' },
  { key: 'socialAi', label: 'Subdomain & Social AI' },
];

export default function SettingsModal({
  modules,
  onChange,
  onClose,
}: {
  modules: TerminalModules;
  onChange: (modules: TerminalModules) => void;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<TerminalModules>(modules);

  const toggle = async (key: keyof TerminalModules) => {
    const next = { ...local, [key]: local[key] === false ? true : false };
    setLocal(next);
    onChange(next);
    setSaving(true);
    try {
      await updateTerminalModules(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-white">Terminal Modules</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-1">
          <p className="text-xs text-slate-500 mb-3">
            Choose which tabs show up here. This is saved to your pharmacy account, so it
            follows you to any device you log into — desktop or web.
          </p>
          {MODULE_LABELS.map(({ key, label }) => {
            const isOn = local[key] !== false;
            return (
              <div
                key={key}
                className="flex items-center justify-between py-2.5 border-b border-slate-800/50 last:border-0"
              >
                <span className="text-sm text-slate-200">{label}</span>
                <button
                  onClick={() => toggle(key)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    isOn ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      isOn ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
