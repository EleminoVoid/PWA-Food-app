/**
 * ===========================================
 * TOP TOOLBAR COMPONENT
 * ===========================================
 * The toolbar at the top of the scanner screen.
 * Can be collapsed (shows just "Utilities" button)
 * or expanded (shows all tool options).
 * 
 * CUSTOMIZATION:
 * - Add/remove tools in the TOOLBAR_TOOLS array
 * - Change labels and icons as needed
 * ===========================================
 */

import { useState } from 'react'
import { Icons } from '../icons/Icons'
import './TopToolbar.css'

/** 
 * TOOLBAR TOOLS CONFIGURATION
 * Add or remove tools here. Each tool needs:
 * - id: unique identifier
 * - label: text shown below icon
 * - icon: component from Icons
 */
const TOOLBAR_TOOLS = [
  { id: 'quality', label: 'Quality', icon: Icons.HD },
  { id: 'flash', label: 'Flash', icon: Icons.Flash },
  { id: 'grid', label: 'Grid', icon: Icons.GridOverlay },
  { id: 'preview', label: 'Preview', icon: Icons.Preview },
]

interface TopToolbarProps {
  /** Called when a tool is clicked. Receives the tool id. */
  onToolClick?: (toolId: string) => void
  /** Called when close button is clicked */
  onClose?: () => void
}

export function TopToolbar({ onToolClick, onClose }: TopToolbarProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const handleToolClick = (toolId: string) => {
    onToolClick?.(toolId)
  }

  return (
    <header className="top-toolbar" role="toolbar" aria-label="Scanner tools">
      {/* COLLAPSED STATE: Just the Utilities button */}
      {!isExpanded && (
        <button
          type="button"
          className="toolbar-button toolbar-button--utilities"
          onClick={() => setIsExpanded(true)}
          aria-label="Open utilities menu"
          aria-expanded={isExpanded}
        >
          <Icons.Grid size={20} />
          <span>Utilities</span>
        </button>
      )}

      {/* EXPANDED STATE: All tools + close button */}
      {isExpanded && (
        <div className="toolbar-expanded" role="group" aria-label="Tool options">
          {TOOLBAR_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="toolbar-tool"
              onClick={() => handleToolClick(tool.id)}
              aria-label={tool.label}
            >
              <tool.icon size={20} />
              <span>{tool.label}</span>
            </button>
          ))}
          
          {/* Close button to collapse toolbar */}
          <button
            type="button"
            className="toolbar-tool toolbar-tool--close"
            onClick={() => {
              setIsExpanded(false)
              onClose?.()
            }}
            aria-label="Close utilities menu"
          >
            <Icons.Close size={20} />
            <span>Close</span>
          </button>
        </div>
      )}
    </header>
  )
}

export default TopToolbar
