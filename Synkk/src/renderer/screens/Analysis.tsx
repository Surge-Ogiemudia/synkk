import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function Analysis() {
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState("Initializing connection...");

  useEffect(() => {
    const runAnalysis = async () => {
      try {
        setMessage("Looking through your POS inventory...");
        // @ts-ignore
        const { ipcRenderer } = window.require('electron');
        
        const state = location.state as any;
        let pathOrUrl = '';
        if (state?.method === 'url') {
           pathOrUrl = state.url;
        } else if (state?.method === 'drop' && state.filePath) {
           pathOrUrl = state.filePath; 
        }

        if (!pathOrUrl) {
          throw new Error("No file or URL provided.");
        }

        setMessage("Synkk is learning your database schema...");
        const response = await ipcRenderer.invoke('start-analysis', pathOrUrl, '');
        
        if (response.success) {
           setMessage("Almost done...");
           setTimeout(() => {
             const finalPath = response.resolvedPath || pathOrUrl;
             navigate('/confirmation', { state: { result: response.result, pathOrUrl: finalPath } });
           }, 1000);
        } else {
           console.error(response.error);
           alert('Analysis failed: ' + response.error);
           navigate('/');
        }
      } catch (err: any) {
        console.error(err);
        alert('Error: ' + err.message);
        navigate('/');
      }
    };
    
    runAnalysis();
  }, [navigate, location]);

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="relative flex items-center justify-center mb-8">
        <Loader2 className="w-16 h-16 text-emerald-500 animate-spin" />
        <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full"></div>
      </div>
      <h2 className="text-2xl font-medium text-white transition-opacity duration-500">
        {message}
      </h2>
      <p className="mt-4 text-slate-400 text-sm max-w-sm">
        Synkk is securely analyzing your POS to automate catalog synchronization.
      </p>
    </div>
  );
}
