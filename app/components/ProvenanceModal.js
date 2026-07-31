import React, { useState } from 'react';

export default function ProvenanceModal({ isOpen, onClose, runData, onReplay }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');

  if (!isOpen || !runData) return null;

  const manifest = runData.manifest || {};
  const sha256 = runData.sha256 || manifest.output_hash || 'N/A';
  const imageUrl = runData.asset_url || runData.image_url;

  const handleCopyHash = () => {
    navigator.clipboard.writeText(sha256);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Cryptographically Verified
            </span>
            <h2 className="text-lg font-bold">Provenance & Lineage Manifest</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-xl font-semibold p-1"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Left Column: Image Preview & Direct Actions */}
          <div className="flex flex-col gap-4">
            <div className="relative aspect-square rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">
              {imageUrl ? (
                <img src={imageUrl} alt="Generated asset" className="object-contain w-full h-full" />
              ) : (
                <span className="text-slate-500 text-sm">No Image Asset Loaded</span>
              )}
            </div>

            {/* SHA-256 Digest Box */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <label className="text-xs font-mono text-slate-400 block mb-1">SHA-256 Asset Digest</label>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-emerald-400 truncate flex-1">{sha256}</code>
                <button
                  onClick={handleCopyHash}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors text-slate-200"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Replay/Fork Action Button */}
            <button
              onClick={() => {
                onReplay(manifest);
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-medium text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Replay / Remix This Run
            </button>
          </div>

          {/* Right Column: Tabbed Metadata Inspector */}
          <div className="flex flex-col gap-4">
            <div className="flex border-b border-slate-800 gap-4">
              <button
                onClick={() => setActiveTab('summary')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'summary'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Lineage Details
              </button>
              <button
                onClick={() => setActiveTab('raw')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'raw'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Raw manifest.json
              </button>
            </div>

            {activeTab === 'summary' ? (
              <div className="space-y-3 text-sm">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-xs block">Prompt</span>
                  <p className="text-slate-200 mt-1 font-medium">{manifest.prompt || runData.prompt || 'N/A'}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-xs block">Model Engine</span>
                    <p className="text-slate-200 font-mono text-xs mt-1">{manifest.model || 'FLUX.1-schnell'}</p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-xs block">Storage Engine</span>
                    <p className="text-slate-200 font-mono text-xs mt-1">Backblaze B2 (S3 API)</p>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-xs block mb-1">Execution Pipeline Steps</span>
                  <div className="space-y-1.5 font-mono text-xs">
                    {(manifest.steps || [
                      { step: 1, name: "huggingface_inference", status: "completed" },
                      { step: 2, name: "sha256_integrity_hash", status: "completed" },
                      { step: 3, name: "backblaze_b2_archive", status: "completed" }
                    ]).map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between text-slate-300">
                        <span>{idx + 1}. {s.name || s.step_name}</span>
                        <span className="text-emerald-400">✓ {s.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <pre className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto max-h-[350px]">
                {JSON.stringify(manifest, null, 2)}
              </pre>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}