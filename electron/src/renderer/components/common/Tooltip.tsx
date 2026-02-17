import React, { useState, useRef, useEffect } from 'react'

interface TooltipProps {
  content: string
  children: React.ReactElement
  delay?: number
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, delay = 300 }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const elementRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      if (elementRef.current) {
        const rect = elementRef.current.getBoundingClientRect()
        setPosition({
          top: rect.top - 8, // 8px above element
          left: rect.left + rect.width / 2, // Center horizontally
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
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            transform: 'translate(-50%, -100%)',
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
          {/* Arrow pointing down */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid #1a1a1a',
            }}
          />
        </div>
      )}
    </>
  )
}
