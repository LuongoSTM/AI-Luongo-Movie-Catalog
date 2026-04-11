import React from 'react';

export const Logo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ff0080" />
        <stop offset="100%" stopColor="#4b0082" />
      </linearGradient>
      <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Bubbles/Particles */}
    <circle cx="50" cy="40" r="6" fill="#ff0080" />
    <circle cx="70" cy="30" r="8" fill="#ff0080" />
    <circle cx="90" cy="45" r="10" fill="#ff0080" />
    <circle cx="60" cy="65" r="12" fill="#ff0080" />
    <circle cx="80" cy="75" r="14" fill="#ff0080" />
    <circle cx="100" cy="60" r="9" fill="#ff0080" />
    <circle cx="40" cy="80" r="7" fill="#ff0080" />
    <circle cx="65" cy="95" r="11" fill="#ff0080" />
    <circle cx="110" cy="80" r="5" fill="#ff0080" />

    {/* Play Button Shape (Rounded Triangle) */}
    <path 
      d="M70 55 C70 45 80 40 90 45 L160 85 C170 90 170 110 160 115 L90 155 C80 160 70 155 70 145 Z" 
      fill="url(#logoGradient)" 
      filter="url(#logoGlow)"
    />

    {/* Text FL */}
    <text 
      x="105" 
      y="112" 
      fill="white" 
      fontSize="38" 
      fontWeight="900" 
      fontFamily="Inter, system-ui, sans-serif" 
      textAnchor="middle"
      style={{ letterSpacing: '-2px' }}
    >
      FL
    </text>
  </svg>
);
