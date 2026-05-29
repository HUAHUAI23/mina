import type { PropsWithChildren } from 'react'

interface AccountPageShellProps extends PropsWithChildren {
  description?: string
  title: string
}

export function AccountPageShell({ children, description, title }: AccountPageShellProps) {
  return (
    <div className="h-full min-h-0 min-w-0 overflow-y-auto bg-surface-container-lowest px-6 py-10 [scrollbar-gutter:stable] max-md:px-5 max-md:py-7">
      <div className="mx-auto grid w-full max-w-3xl gap-8">
        <header className="grid gap-2">
          <h1 className="font-display m-0 text-2xl font-bold leading-tight tracking-normal text-foreground max-md:text-xl">
            {title}
          </h1>
          {description ? (
            <p className="m-0 max-w-2xl text-sm leading-6 text-foreground-secondary">{description}</p>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  )
}
