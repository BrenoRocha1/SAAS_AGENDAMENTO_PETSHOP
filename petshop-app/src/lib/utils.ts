import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Junta classes Tailwind resolvendo conflitos (a última vence) — o `cn`
// que os componentes no padrão shadcn (src/components/ui) esperam.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
