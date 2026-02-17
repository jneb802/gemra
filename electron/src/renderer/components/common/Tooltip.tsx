import React, { useState, useRef, useEffect } from 'react'

interface TooltipProps {
  content: string
  children: React.ReactElement
  delay?: number
}

interface TooltipPosition {
  top: number
  left: number
  placement: 'top' | 'bottom'
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, delay = 300 }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const elementRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      if (elementRef.current) {
        const rect = elementRef.current.getBoundingClientRect()
        setPosition({
          top: rect.top - 8, // 8px above element (will be adjusted after render)
          left: rect.left + rect.width / 2, // Center horizontally
          placement: 'top',
        })
        setIsVisible(true)
      }
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Adjust tooltip position after render to keep it on screen
  useEffect(() => {
    if (isVisible && position && tooltipRef.current && elementRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect()
      const elementRect = elementRef.current.getBoundingClientRect()
      const padding = 8 // Padding from screen edges

      let newTop = position.top
      let newLeft = position.left
      let newPlacement = position.placement

      // Check if tooltip would go off the top of the screen
      if (position.placement === 'top') {
        const tooltipTop = position.top - tooltipRect.height
        if (tooltipTop < padding) {
          // Not enough space above, flip to bottom
          newPlacement = 'bottom'
          newTop = elementRect.bottom + 8
        }
      }

      // Check horizontal boundaries
      const tooltipLeft = newLeft - tooltipRect.width / 2
      const tooltipRight = newLeft + tooltipRect.width / 2

      if (tooltipLeft < padding) {
        // Too far left, adjust to stay on screen
        newLeft = tooltipRect.width / 2 + padding
      } else if (tooltipRight > window.innerWidth - padding) {
        // Too far right, adjust to stay on screen
        newLeft = window.innerWidth - tooltipRect.width / 2 - padding
      }

      // Update position if it changed
      if (newTop !== position.top || newLeft !== position.left || newPlacement !== position.placement) {
        setPosition({ top: newTop, left: newLeft, placement: newPlacement })
      }
    }
  }, [isVisible, position])

  return (
    <>
      <div
        ref={elementRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'inline-block' }}
      >
        {children}
      </div>

      {isVisible && position && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            transform:
              position.placement === 'top'
                ? 'translate(-50%, -100%)'
                : 'translate(-50%, 0%)',
            padding: '6px 10px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #3a3a3a',
            borderRadius: '4px',
            color: '#e0e0e0',
            fontSize: '12px',
            whiteSpace: 'pre-line',
            zIndex: 10000,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            maxWidth: '300px',
          }}
        >
          {content}
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              ...(position.placement === 'top'
                ? {
                    top: '100%',
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderTop: '5px solid #1a1a1a',
                  }
                : {
                    bottom: '100%',
                    borderLeft: '5px solid transparent',
                    borderRight: '5px solid transparent',
                    borderBottom: '5px solid #1a1a1a',
                  }),
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
            }}
          />
        </div>
      )}
    </>
  )
}
