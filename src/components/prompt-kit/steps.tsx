import type React from 'react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

function classNames(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(' ')
}

export type StepsItemProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  'title'
> & {
  icon: React.ReactNode
  title: React.ReactNode
}

export const StepsItem = ({
  children,
  className,
  icon,
  title,
  ...props
}: StepsItemProps) => (
  <Collapsible
    className={classNames('prompt-steps-item', className)}
    {...props}
  >
    <CollapsibleTrigger className="prompt-steps-item-trigger">
      <span className="prompt-steps-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="prompt-steps-item-title">{title}</span>
      <i
        className="hn hn-chevron-down prompt-steps-item-chevron"
        aria-hidden="true"
      />
    </CollapsibleTrigger>
    <CollapsibleContent className="prompt-steps-item-content">
      {children}
    </CollapsibleContent>
  </Collapsible>
)

export type StepsTriggerProps = React.ComponentProps<
  typeof CollapsibleTrigger
> & {
  leftIcon?: React.ReactNode
}

export const StepsTrigger = ({
  children,
  className,
  leftIcon,
  ...props
}: StepsTriggerProps) => (
  <CollapsibleTrigger
    className={classNames('prompt-steps-trigger', className)}
    {...props}
  >
    <span className="prompt-steps-trigger-copy">
      {leftIcon ? (
        <span className="prompt-steps-left-icon">
          <span className="prompt-steps-primary-icon">{leftIcon}</span>
        </span>
      ) : null}
      <span>{children}</span>
    </span>
    <i className="hn hn-chevron-down prompt-steps-chevron" aria-hidden="true" />
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
