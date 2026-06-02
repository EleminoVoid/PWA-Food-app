/**
 * ===========================================
 * BOTTOM BAR COMPONENT
 * ===========================================
 * The control bar at the bottom of the screen.
 * Contains: Gallery button, Scan button, Presets button
 * 
 * CUSTOMIZATION:
 * - Change scannedCount to show different page counts
 * - Modify button labels in the JSX below
 * - Add new buttons by following the existing pattern
 * ===========================================
 */

import { Icons } from '../icons/Icons'
import './BottomBar.css'

interface BottomBarProps {
  /** Number of scanned pages to display */
  scannedCount?: number
  /** Called when Gallery button is clicked */
  onGalleryClick?: () => void
  /** Called when Scan button is clicked */
  onScanClick?: () => void
  /** Called when Presets button is clicked */
  onPresetsClick?: () => void
  /** Whether the scan button should be disabled */
  scanDisabled?: boolean
}

export function BottomBar({
  scannedCount = 0,
  onGalleryClick,
  onScanClick,
  onPresetsClick,
  scanDisabled = false,
}: BottomBarProps) {
  return (
    <footer className="bottom-bar" role="toolbar" aria-label="Scanner controls">
      {/* PAGE COUNT INDICATOR */}
      {scannedCount > 0 && (
        <div className="scanned-count" aria-live="polite">
          Scanned Pages: {scannedCount}
        </div>
      )}

      {/* MAIN CONTROL BAR */}
      <div className="bottom-controls">
        {/* GALLERY BUTTON - Left side */}
        <button
          type="button"
          className="bottom-button bottom-button--gallery"
          onClick={onGalleryClick}
          aria-label="Open gallery"
        >
          <Icons.Gallery size={20} />
          <span>Gallery</span>
        </button>

        {/* SCAN BUTTON - Center, prominent */}
        <button
          type="button"
          className="scan-button"
          onClick={onScanClick}
          disabled={scanDisabled}
          aria-label="Capture document"
        >
          <Icons.Scan size={24} />
        </button>

        {/* PRESETS BUTTON - Right side */}
        <button
          type="button"
          className="bottom-button bottom-button--presets"
          onClick={onPresetsClick}
          aria-label="Document presets"
        >
          <span className="presets-label">DOC</span>
          <span>Presets</span>
        </button>
      </div>
    </footer>
  )
}

export default BottomBar
