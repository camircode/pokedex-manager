import { createFileRoute, redirect } from '@tanstack/react-router'

import { AppShell } from '@/components/app-shell'
import { getSession } from '@/server/session'

export const Route = createFileRoute('/app')({
  beforeLoad: async () => {
    const session = await getSession()
    if (session === null) throw redirect({ to: '/sign-in' })
    return { session }
  },
  component: AppShell,
})
