import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

import { getSessionFromHeaders } from '@/server/auth'

export const getSession = createServerFn({ method: 'GET' }).handler(() =>
  getSessionFromHeaders(getRequestHeaders()),
)
