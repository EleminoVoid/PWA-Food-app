/**
 * ===========================================
 * SCANNER FRAME COMPONENT
 * ===========================================
 * The yellow corner brackets that show the
 * document detection area.
 * 
 * CUSTOMIZATION:
 * - Change --frame-color to change bracket color
 * - Adjust --frame-size for bracket length
 * - Modify --frame-thickness for line width
 * ===========================================
 */

import './ScannerFrame.css'

interface ScannerFrameProps {
  /** Optional class name for additional styling */
  className?: string
}

export function ScannerFrame({ className = '' }: ScannerFrameProps) {
  return (
    <div 
      className={`scanner-frame ${className}`.trim()} 
      role="img" 
      aria-label="Document scanning area"
    >
      {/* Four corners of the scanning frame */}
      <div className="scanner-corner scanner-corner--top-left" aria-hidden="true" />
      <div className="scanner-corner scanner-corner--top-right" aria-hidden="true" />
      <div className="scanner-corner scanner-corner--bottom-left" aria-hidden="true" />
      <div className="scanner-corner scanner-corner--bottom-right" aria-hidden="true" />
    </div>
  )
}

export default ScannerFrame
