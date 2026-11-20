import React from 'react';

export function TitleCrestSvg() {
  return (
    <svg
      viewBox="0 0 390 92"
      className="w-full max-w-[360px] h-auto select-none"
      aria-label="Ковель Воксель Ферма"
    >
      {/* Shield Emblem */}
      <g transform="translate(6, 8)">
        <rect x="6" y="6" width="64" height="68" rx="10" fill="#2d1e12" stroke="#f5b700" strokeWidth="3" />
        <rect x="12" y="12" width="52" height="56" rx="6" fill="#3f6212" />
        {/* Voxel Wheat & Sun */}
        <rect x="26" y="18" width="24" height="12" fill="#facc15" />
        <rect x="34" y="28" width="8" height="32" fill="#eab308" />
        <rect x="22" y="34" width="10" height="8" fill="#fde047" />
        <rect x="44" y="34" width="10" height="8" fill="#fde047" />
        <rect x="20" y="46" width="12" height="8" fill="#fde047" />
        <rect x="44" y="46" width="12" height="8" fill="#fde047" />
        <rect x="14" y="58" width="48" height="10" fill="#78350f" />
      </g>
      {/* Typography Lockup */}
      <text
        x="84"
        y="45"
        fill="#fef3c7"
        stroke="#291a0e"
        strokeWidth="5"
        paintOrder="stroke fill"
        fontSize="29"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="1"
      >
        КОВЕЛЬ ФЕРМА
      </text>
      <text
        x="86"
        y="69"
        fill="#fde047"
        stroke="#291a0e"
        strokeWidth="3"
        paintOrder="stroke fill"
        fontSize="11.2"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="1.3"
      >
        3D ІЗОМЕТРИЧНИЙ ВОКСЕЛЬНИЙ СВІТ
      </text>
    </svg>
  );
}

export function CoinSvg({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#92400e" />
      <circle cx="12" cy="12" r="8" fill="#f59e0b" />
      <circle cx="11.5" cy="11.5" r="6" fill="#fde047" />
      <rect x="10.5" y="7.5" width="3" height="9" rx="1" fill="#b45309" />
    </svg>
  );
}

export function HoeSvg({ color = '#9a5b32', className = 'w-6 h-6' }: { color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5 19L16 8" stroke="#451a03" strokeWidth="4" strokeLinecap="round" />
      <path d="M5 19L16 8" stroke="#b45309" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 4H20V9L16 11L12 7V4Z" fill="#1e293b" />
      <path d="M13 5H19V8L16 9.5L13 6.5V5Z" fill={color} />
    </svg>
  );
}

export function WaterCanSvg({ color = '#a16207', className = 'w-6 h-6' }: { color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="6" y="9" width="11" height="10" rx="2" fill="#1e293b" />
      <rect x="7" y="10" width="9" height="8" rx="1.5" fill={color} />
      <path d="M6 12H3V15H6" fill="none" stroke="#1e293b" strokeWidth="2.5" />
      <path d="M17 12L21 8L22 9.5L17 15Z" fill="#38bdf8" />
    </svg>
  );
}

export function SeedSvg({ color = '#eab308', className = 'w-6 h-6' }: { color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="6" y="4" width="12" height="16" rx="3" fill="#291a0e" />
      <rect x="7.5" y="5.5" width="9" height="13" rx="2" fill="#fef3c7" />
      <circle cx="12" cy="13" r="3.2" fill={color} />
      <path d="M12 9.5V6.8" stroke="#15803d" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LandPlotSvg({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <polygon points="12,3 21,8 12,13 3,8" fill="#84cc16" stroke="#1e293b" strokeWidth="1.5" />
      <polygon points="3,8 12,13 12,20 3,15" fill="#78350f" stroke="#1e293b" strokeWidth="1.5" />
      <polygon points="21,8 12,13 12,20 21,15" fill="#5c280b" stroke="#1e293b" strokeWidth="1.5" />
    </svg>
  );
}
