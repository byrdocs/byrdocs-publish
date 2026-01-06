"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

// Context to share shortcut info between Label and LabelKbd
const LabelShortcutContext = React.createContext<{
  registerShortcut: (shortcut: string) => void
  shortcutState: {
    currentSequence: string
    isWaitingForNext: boolean
    isHighlighted: boolean
  }
} | null>(null)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, htmlFor, children, ...props }, ref) => {
  const [shortcut, setShortcut] = React.useState<string | null>(null)
  const [shortcutState, setShortcutState] = React.useState({
    currentSequence: '',
    isWaitingForNext: false,
    isHighlighted: false
  })
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  
  const registerShortcut = React.useCallback((shortcut: string) => {
    setShortcut(shortcut.toLowerCase())
  }, [])

  const focusElement = React.useCallback((targetElement: HTMLElement) => {
    // 如果元素本身可以focus
    if (targetElement.tabIndex >= 0 || 
        ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(targetElement.tagName) ||
        targetElement.hasAttribute('contenteditable')) {
      targetElement.focus()
      return
    }
    
    // 尝试找到第一个可focus的子元素
    const focusableElement = targetElement.querySelector('input, textarea, button, select, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable]') as HTMLElement
    if (focusableElement) {
      focusableElement.focus()
      return
    }
    
    // 如果没有找到可focus的子元素，临时给目标元素添加tabindex并focus
    const originalTabIndex = targetElement.getAttribute('tabindex')
    targetElement.setAttribute('tabindex', '0')
    targetElement.focus()
    
    // focus后恢复原来的tabindex状态
    setTimeout(() => {
      if (originalTabIndex !== null) {
        targetElement.setAttribute('tabindex', originalTabIndex)
      } else {
        targetElement.removeAttribute('tabindex')
      }
    }, 100)
  }, [])

  React.useEffect(() => {
    if (!shortcut || !htmlFor) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      
      // Check if focus is in input, textarea, or element with disable-shortcut class
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.closest('.disable-shortcut')
      ) {
        return
      }

      // Check if any modifier keys are pressed (ctrl, meta, alt, command)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      const normalizedEventKey = event.key.toLowerCase()
      const shortcutKeys = shortcut.split('')
      
      // If it's a single key shortcut, handle it as before
      if (shortcutKeys.length === 1) {
        if (normalizedEventKey === shortcut) {
          event.preventDefault()
          const targetElement = document.getElementById(htmlFor)
          if (targetElement) {
            focusElement(targetElement)
          }
        }
        return
      }

      // Handle multi-key sequences
      const currentIndex = shortcutState.currentSequence.length
      const expectedKey = shortcutKeys[currentIndex]
      
      if (normalizedEventKey === expectedKey) {
        event.preventDefault()
        const newSequence = shortcutState.currentSequence + normalizedEventKey
        
        if (newSequence === shortcut) {
          // Complete sequence matched, focus the target element
          setShortcutState({
            currentSequence: '',
            isWaitingForNext: false,
            isHighlighted: false
          })
          
          const targetElement = document.getElementById(htmlFor)
          if (targetElement) {
            focusElement(targetElement)
          }
        } else {
          // Partial match, wait for next key
          setShortcutState({
            currentSequence: newSequence,
            isWaitingForNext: true,
            isHighlighted: true
          })
          
          // Clear timeout if exists
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
          }
          
          // Set timeout to reset state after 3 seconds
          timeoutRef.current = setTimeout(() => {
            setShortcutState({
              currentSequence: '',
              isWaitingForNext: false,
              isHighlighted: false
            })
          }, 3000)
        }
      } else {
        // Wrong key pressed, reset immediately
        if (shortcutState.isWaitingForNext || shortcutState.currentSequence.length > 0) {
          setShortcutState({
            currentSequence: '',
            isWaitingForNext: false,
            isHighlighted: false
          })
          
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [shortcut, htmlFor, shortcutState, focusElement])

  return (
    <LabelShortcutContext.Provider value={{ registerShortcut, shortcutState }}>
      <LabelPrimitive.Root
        ref={ref}
        className={cn(labelVariants(), className)}
        htmlFor={htmlFor}
        {...props}
      >
        {children}
      </LabelPrimitive.Root>
    </LabelShortcutContext.Provider>
  )
})
Label.displayName = LabelPrimitive.Root.displayName

export interface LabelKbdProps extends React.HTMLAttributes<HTMLElement> {}

const LabelKbd = React.forwardRef<HTMLElement, LabelKbdProps>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(LabelShortcutContext)
    const shortcutText = React.Children.toArray(children).join('')
    
    React.useEffect(() => {
      if (context && children) {
        context.registerShortcut(shortcutText)
      }
    }, [context, children, shortcutText])
    
    // Determine the visual state based on shortcut progress
    const getKeyState = (keyIndex: number, key: string) => {
      if (!context?.shortcutState) return 'normal'
      
      const { currentSequence, isWaitingForNext } = context.shortcutState
      
      // Check if this shortcut could match the current sequence
      const shortcutKeys = shortcutText.split('')
      const couldMatch = shortcutKeys.slice(0, currentSequence.length).join('') === currentSequence
      
      if (!couldMatch) {
        return 'normal'
      }
      
      if (keyIndex < currentSequence.length) {
        return 'pressed' // Key has been pressed
      } else if (keyIndex === currentSequence.length && isWaitingForNext) {
        return 'waiting' // This is the next key to press
      }
      return 'normal'
    }
    
    // Check if this shortcut should be highlighted
    const { currentSequence, isWaitingForNext } = context?.shortcutState || {}
    const shortcutKeys = shortcutText.split('')
    const couldMatch = shortcutKeys.slice(0, (currentSequence || '').length).join('') === (currentSequence || '')
    const isHighlighted = isWaitingForNext && couldMatch
    
    return (
      <kbd
        className={cn(
          "hidden sm:inline-block ml-1 px-1 py-px bg-muted text-muted-foreground text-xs border rounded transition-all duration-200",
          className
        )}
        ref={ref}
        {...props}
      >
        {shortcutText.length > 1 ? (
          // Multi-key sequence: render each key with individual styling
          shortcutText.split('').map((key, index) => {
            const keyState = getKeyState(index, key)
            return (
              <span
                key={index}
                className={cn(
                  "transition-all duration-200",
                  keyState === 'pressed' && "opacity-50 text-muted-foreground/70",
                  keyState === 'waiting' && "text-primary font-semibold",
                  keyState === 'normal' && ""
                )}
              >
                {key}
              </span>
            )
          })
        ) : (
          // Single key: render normally
          children
        )}
      </kbd>
    )
  }
)
LabelKbd.displayName = "LabelKbd"

export { Label, LabelKbd }
