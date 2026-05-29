import type { PropsWithChildren } from 'react'

interface AccountPageShellProps extends PropsWithChildren {
  description?: string
  title: string
}

export function AccountPageShell({ children }: AccountPageShellProps) {
  return (
    <div className="h-full min-h-0 min-w-0 overflow-y-auto bg-surface-container-lowest px-6 py-10 [scrollbar-gutter:stable] max-md:px-5 max-md:py-7">
      <div className="mx-auto grid min-h-full w-full max-w-3xl content-center pb-[8dvh]">
        {children}
      </div>
    </div>
  )
}
