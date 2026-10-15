import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Junta classes deixando a ultima vencer quando houver conflito
 *  (p-3 passado de fora sobrepoe o p-4 do componente). */
export function cn(...classes: ClassValue[]) {
  return twMerge(clsx(classes))
}
