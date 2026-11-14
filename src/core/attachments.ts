// src/core/attachments.ts
// The images a person may attach: their types, the extension each is stored under and their size bound.

import { lookup } from './lookup'

/** Each image type a person may attach, with the extension its file is stored and exported under. */
export const ATTACHMENT_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const

export type AttachmentType = keyof typeof ATTACHMENT_EXTENSIONS

export const ATTACHMENT_TYPES = Object.keys(ATTACHMENT_EXTENSIONS) as readonly AttachmentType[]

/** The largest image a person may attach, and so the largest upload the broker reads. */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024

/** The extension of an image type a person may attach; undefined for any other, `constructor` included. */
export function attachmentExtension(mime: string): string | undefined {
  return lookup(ATTACHMENT_EXTENSIONS, mime)
}
