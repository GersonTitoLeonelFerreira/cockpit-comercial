'use client'

import * as React from 'react'

import {
  editingLinesToText,
  editingTextToLines,
} from '@/app/lib/commercial-config/text-editing'

type Props = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> & {
  value: string[]
  onChange: (value: string[]) => void
}

export default function EditableLinesTextarea({
  value,
  onChange,
  ...props
}: Props) {
  return (
    <textarea
      {...props}
      value={editingLinesToText(value)}
      onChange={(event) =>
        onChange(editingTextToLines(event.currentTarget.value))
      }
    />
  )
}
