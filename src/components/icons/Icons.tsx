/**
 * ===========================================
 * ICONS COMPONENT
 * ===========================================
 * All SVG icons used in the app.
 * Easy to add/remove/modify icons here.
 * 
 * USAGE: <Icons.Grid size={20} />
 * ===========================================
 */

import type { SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

// Helper to create consistent icon components
const createIcon = (path: React.ReactNode, viewBox = '0 0 24 24') => {
  return function Icon({ size = 24, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {path}
      </svg>
    )
  }
}

export const Icons = {
  /** 4-dot grid menu icon */
  Grid: createIcon(
    <>
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),

  /** HD quality indicator */
  HD: createIcon(
    <>
      <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor" stroke="none">
        HD
      </text>
    </>
  ),

  /** Lightning bolt for flash */
  Flash: createIcon(
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="none" />
  ),

  /** Grid overlay icon */
  GridOverlay: createIcon(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </>
  ),

  /** Stars/sparkles for preview/effects */
  Preview: createIcon(
    <>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z" />
    </>
  ),

  /** X close button */
  Close: createIcon(
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),

  /** Image/gallery icon */
  Gallery: createIcon(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M21 15l-5-5-6 6" />
      <path d="M14 14l-3-3-8 8" />
    </>
  ),

  /** Document/scan icon */
  Scan: createIcon(
    <>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="9" y1="7" x2="15" y2="7" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="12" y2="15" />
    </>
  ),
}

export default Icons
