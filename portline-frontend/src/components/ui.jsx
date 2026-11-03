import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Check, ChevronDown, ChevronUp, X, CheckCircle2 } from 'lucide-react'
import { cn } from '../lib/utils'

export const Button = React.forwardRef(({ className, variant = 'primary', size = 'md', type = 'button', children, ...props }, ref) => {
  const variants = {
    primary: 'bg-[var(--accent-strong)] text-white hover:bg-[var(--accent)] shadow-[0_7px_18px_rgba(71,124,114,.15)]',
    secondary: 'bg-[var(--surface-soft)] text-[var(--ink)] hover:bg-[var(--surface-raised)] border border-[var(--line)]',
    outline: 'border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-2)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-strong)]',
    ghost: 'bg-transparent text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]',
    danger: 'bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20',
    success: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20',
  }
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-9 px-3.5 text-sm', lg: 'h-11 px-5 text-sm', icon: 'h-9 w-9 p-0' }
  return <button ref={ref} type={type} className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-semibold tracking-[-.01em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-45', variants[variant], sizes[size], className)} {...props}>{children}</button>
})
Button.displayName = 'Button'

export function Card({ className, children, ...props }) { return <div className={cn('rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]', className)} {...props}>{children}</div> }
export function CardHeader({ className, ...props }) { return <div className={cn('flex items-start justify-between gap-3 px-4 pt-4', className)} {...props} /> }
export function CardTitle({ className, ...props }) { return <h3 className={cn('text-sm font-semibold tracking-tight text-[var(--ink)]', className)} {...props} /> }
export function CardContent({ className, ...props }) { return <div className={cn('px-4 pb-4', className)} {...props} /> }

const badgeVariants = {
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  danger: 'border-red-500/25 bg-red-500/10 text-red-300',
  info: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
  neutral: 'border-slate-700 bg-slate-800/70 text-slate-300',
}
export function Badge({ variant = 'neutral', className, children, dot = false }) {
  return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[.07em]', badgeVariants[variant] || badgeVariants.neutral, className)}>{dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}</span>
}

export const Input = React.forwardRef(({ className, ...props }, ref) => <input ref={ref} className={cn('h-10 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface-input)] px-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--quiet)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50', className)} {...props} />)
Input.displayName = 'Input'
export const Textarea = React.forwardRef(({ className, ...props }, ref) => <textarea ref={ref} className={cn('min-h-24 w-full resize-y rounded-lg border border-[var(--line-strong)] bg-[var(--surface-input)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--quiet)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]', className)} {...props} />)
Textarea.displayName = 'Textarea'
export function Label({ className, ...props }) { return <label className={cn('mb-1.5 block text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--muted)]', className)} {...props} /> }

export function Dialog({ open, onOpenChange, children }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>{children}</DialogPrimitive.Root>
}
export function DialogContent({ className, children }) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" /><DialogPrimitive.Content className={cn('fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl outline-none', className)}>{children}<DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-slate-500 transition hover:bg-slate-800 hover:text-white"><X size={16} /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>
}
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description
export const DialogTrigger = DialogPrimitive.Trigger

export function DropdownMenu({ children }) { return <DropdownMenuPrimitive.Root>{children}</DropdownMenuPrimitive.Root> }
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export function DropdownMenuContent({ className, ...props }) { return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content sideOffset={6} className={cn('z-50 min-w-44 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-1 shadow-xl', className)} {...props} /></DropdownMenuPrimitive.Portal> }
export function DropdownMenuItem({ className, ...props }) { return <DropdownMenuPrimitive.Item className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-xs text-[var(--ink-2)] outline-none transition hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] focus:bg-[var(--surface-soft)] data-[disabled]:pointer-events-none data-[disabled]:opacity-40', className)} {...props} /> }
export function DropdownMenuSeparator() { return <DropdownMenuPrimitive.Separator className="my-1 h-px bg-[var(--line)]" /> }

export function Checkbox({ checked, onCheckedChange, disabled, className }) {
  return <CheckboxPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className={cn('flex h-4 w-4 items-center justify-center rounded border border-[var(--line-strong)] bg-[var(--surface-input)] transition data-[state=checked]:border-[var(--accent-strong)] data-[state=checked]:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] disabled:opacity-50', className)}><CheckboxPrimitive.Indicator><Check size={11} className="text-white" strokeWidth={3} /></CheckboxPrimitive.Indicator></CheckboxPrimitive.Root>
}

export function Switch({ checked, onCheckedChange, disabled }) {
  return <SwitchPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="relative h-5 w-9 rounded-full bg-slate-700 outline-none transition data-[state=checked]:bg-cyan disabled:opacity-50"><SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" /></SwitchPrimitive.Root>
}

export function Select({ value, onValueChange, options, placeholder = 'Select option', className, disabled }) {
  return <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}><SelectPrimitive.Trigger className={cn('flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-input)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] disabled:opacity-50', className)}><SelectPrimitive.Value placeholder={placeholder} /><SelectPrimitive.Icon><ChevronDown size={14} className="text-[var(--muted)]" /></SelectPrimitive.Icon></SelectPrimitive.Trigger><SelectPrimitive.Portal><SelectPrimitive.Content position="popper" sideOffset={5} className="z-[80] max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-slate-700 bg-[#111927] shadow-xl"><SelectPrimitive.Viewport className="p-1">{options.map((option) => <SelectPrimitive.Item key={option.value} value={option.value} className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-xs text-slate-300 outline-none hover:bg-slate-800 focus:bg-slate-800 data-[state=checked]:text-cyan"><SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText><SelectPrimitive.ItemIndicator><Check size={13} /></SelectPrimitive.ItemIndicator></SelectPrimitive.Item>)}</SelectPrimitive.Viewport></SelectPrimitive.Content></SelectPrimitive.Portal></SelectPrimitive.Root>
}

export function Progress({ value = 0, className }) {
  return <ProgressPrimitive.Root value={value} className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-soft)]', className)}><ProgressPrimitive.Indicator className="h-full bg-cyan transition-all" style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value))}%)` }} /></ProgressPrimitive.Root>
}

export function TooltipProvider({ children }) { return <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider> }
export function Tooltip({ children, content }) { return <TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={7} className="z-[90] rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-200 shadow-xl">{content}<TooltipPrimitive.Arrow className="fill-slate-900" /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root> }

export function Avatar({ initials = 'OP', className }) { return <div className={cn('flex h-9 w-9 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent-strong)]', className)}>{initials}</div> }
export function EmptyState({ icon: Icon, title, description, action }) { return <div className="flex flex-col items-center justify-center py-14 text-center">{Icon && <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-500"><Icon size={22} /></div>}<p className="text-sm font-semibold text-[var(--ink)]">{title}</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--muted)]">{description}</p>{action && <div className="mt-4">{action}</div>}</div> }

export function SectionHeading({ eyebrow, title, description, action }) {
  return <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div>{eyebrow && <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-cyan"><span className="h-px w-5 bg-cyan/60" />{eyebrow}</div>}<h1 className="text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">{title}</h1>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div>{action && <div className="flex items-center gap-2">{action}</div>}</div>
}
