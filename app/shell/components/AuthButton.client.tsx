'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabaseBrowser'
import ProfileMenu from './ProfileMenu.client'

export default function AuthButton() {
  return <ProfileMenu />
}