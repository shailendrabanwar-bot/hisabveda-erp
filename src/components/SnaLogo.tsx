import React from 'react';

export const HISABVEDA_LOGO_PATH = '/assets/aistudio/HISAB_VEDA_ERP_accounting_logo_58b6a0fc.png';

interface HisabvedaLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  variant?: 'badge' | 'full';
  className?: string;
}

export const HisabvedaLogo: React.FC<HisabvedaLogoProps> = ({
  size = 'md',
  showText = true,
  variant = 'badge',
  className = ''
}) => {
  const sizeMap = {
    sm: { box: 'w-9 h-9', fullBox: 'w-14 h-14', text: 'text-sm', sub: 'text-[9px]' },
    md: { box: 'w-11 h-11', fullBox: 'w-20 h-20', text: 'text-base', sub: 'text-[10px]' },
    lg: { box: 'w-14 h-14', fullBox: 'w-24 h-24', text: 'text-lg', sub: 'text-xs' },
    xl: { box: 'w-16 h-16', fullBox: 'w-32 h-32', text: 'text-2xl', sub: 'text-sm' }
  };

  const dim = sizeMap[size];

  if (variant === 'full') {
    return (
      <div className={`inline-flex flex-col items-center gap-2 ${className}`}>
        <div className="relative group">
          {/* Outer Animated Halo Glow (Gold + Emerald + Navy) */}
          <div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-tr from-amber-400 via-emerald-400 to-sky-500 opacity-55 blur-md group-hover:opacity-90 group-hover:blur-lg transition duration-500 pointer-events-none" />
          {/* Metallic Border Ring */}
          <div className="relative p-[2px] rounded-2xl bg-gradient-to-br from-amber-300 via-emerald-400 to-sky-500 shadow-2xl shadow-emerald-950/50 transition-transform duration-300 group-hover:scale-[1.03]">
            {/* Crisp Pearl Showcase Card */}
            <div className={`${dim.fullBox} rounded-[14px] bg-gradient-to-b from-white via-slate-50 to-emerald-50/40 p-1.5 flex items-center justify-center overflow-hidden relative`}>
              {/* Subtle Glass Highlight */}
              <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/70 to-transparent pointer-events-none" />
              <img
                src={HISABVEDA_LOGO_PATH}
                alt="HisabVeda ERP Accounting Solution Logo"
                className="w-full h-full object-contain relative z-10 drop-shadow-sm select-none"
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Attractive Illuminated Emblem Medallion using Official Uploaded Logo */}
      <div
        className={`relative ${dim.box} rounded-2xl p-[1.5px] shadow-lg shadow-emerald-500/20 group hover:shadow-amber-400/35 transition-all duration-300 shrink-0`}
      >
        {/* Shimmering Gold + Emerald + Sky Border */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-amber-400 via-emerald-400 to-sky-500 opacity-85 group-hover:opacity-100 transition duration-300" />
        <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-tr from-amber-400/30 via-emerald-400/30 to-sky-500/30 blur-[3px] opacity-60 group-hover:opacity-100 transition duration-300 pointer-events-none" />

        {/* Inner White Pearl Medallion centered cleanly on the Book & Growth V Crest */}
        <div className="relative w-full h-full bg-white rounded-[14px] flex items-center justify-center overflow-hidden shadow-inner">
          <img
            src={HISABVEDA_LOGO_PATH}
            alt="HisabVeda ERP"
            className="w-full h-full object-cover object-[50%_17%] scale-[1.42] transition-transform duration-300 group-hover:scale-[1.48] select-none"
            draggable={false}
          />
        </div>
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1">
            <span className={`hv-logo-hisab font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 ${dim.text} leading-tight`}>
              HISAB
            </span>
            <span className={`hv-logo-veda font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 ${dim.text} leading-tight`}>
              VEDA
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`hv-logo-sub font-bold tracking-widest uppercase text-amber-400 ${dim.sub}`}>
              हिसाबवेद
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hv-logo-badge text-[9px] font-mono text-emerald-300 font-bold bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/40">
              ERP v2.0
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// Backward-compatible alias
export const SnaLogo = HisabvedaLogo;
