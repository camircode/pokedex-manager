import { ChevronDown } from 'lucide-react'
import type React from 'react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

function classNames(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(' ')
}

export type StepsItemProps = React.ComponentProps<'div'>

export const StepsItem = ({
  children,
  className,
  ...props
}: StepsItemProps) => (
  <div className={classNames('prompt-steps-item', className)} {...props}>
    {children}
  </div>
)

export type StepsTriggerProps = React.ComponentProps<
  typeof CollapsibleTrigger
> & {
  leftIcon?: React.ReactNode
  swapIconOnHover?: boolean
}

export const StepsTrigger = ({
  children,
  className,
  leftIcon,
  swapIconOnHover = true,
  ...props
}: StepsTriggerProps) => (
  <CollapsibleTrigger
    className={classNames('prompt-steps-trigger', className)}
    {...props}
  >
    <span className="prompt-steps-trigger-copy">
      {leftIcon ? (
        <span className="prompt-steps-left-icon">
          <span
            className={classNames(
              'prompt-steps-primary-icon',
              swapIconOnHover && 'swappable',
            )}
          >
            {leftIcon}
          </span>
          {swapIconOnHover && (
            <ChevronDown className="prompt-steps-hover-icon" aria-hidden />
          )}
        </span>
      ) : null}
      <span>{children}</span>
    </span>
    {!leftIcon && <ChevronDown className="prompt-steps-chevron" aria-hidden />}
  </CollapsibleTrigger>
)

export type StepsContentProps = React.ComponentProps<
  typeof CollapsibleContent
> & {
  bar?: React.ReactNode
}

export const StepsContent = ({
  children,
  className,
  bar,
  ...props
}: StepsContentProps) => (
  <CollapsibleContent
    className={classNames('prompt-steps-content', className)}
    {...props}
  >
    <div className="prompt-steps-grid">
      <div className="prompt-steps-bar-slot">{bar ?? <StepsBar />}</div>
      <div className="prompt-steps-items">{children}</div>
    </div>
  </CollapsibleContent>
)

export type StepsBarProps = React.HTMLAttributes<HTMLDivElement>

export const StepsBar = ({ className, ...props }: StepsBarProps) => (
  <div
    className={classNames('prompt-steps-bar', className)}
    aria-hidden
    {...props}
  />
)

export type StepsProps = React.ComponentProps<typeof Collapsible>

export function Steps({ defaultOpen = true, className, ...props }: StepsProps) {
  return (
    <Collapsible
      className={classNames('prompt-steps', className)}
      defaultOpen={defaultOpen}
      {...props}
    />
  )
}
