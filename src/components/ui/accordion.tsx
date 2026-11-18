"use client"

import * as React from "react"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { cn } from "cn"

/**
 * shadcn-style wrapper over @base-ui/react/accordion (base-nova, NO Radix).
 *
 * `Accordion.Root` es un accordion UNICO por defecto (`multiple: false`):
 * un solo panel abierto a la vez. La prop `value` controla el panel abierto
 * (array con el valor del item); `multiple` permite varios abiertos.
 *
 * Atributos de estado: el trigger renderiza `data-panel-open=""` cuando su
 * panel está abierto (uso `data-panel-open:` para rotar el chevron, NO
 * `data-open:`).
 */

const Accordion = AccordionPrimitive.Root

const AccordionItem = AccordionPrimitive.Item

const AccordionHeader = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Header>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Header>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Header
    ref={ref}
    className={cn("contents", className)}
    {...props}
  />
))
AccordionHeader.displayName = "AccordionHeader"

const AccordionTrigger = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Trigger
    ref={ref}
    className={cn(
      "group flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors",
      "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      "data-[panel-open]:bg-muted/40",
      className
    )}
    {...props}
  />
))
AccordionTrigger.displayName = "AccordionTrigger"

const AccordionPanel = React.forwardRef<
  React.ComponentRef<typeof AccordionPrimitive.Panel>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Panel>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Panel
    ref={ref}
    className={cn(
      // `grid gap-4` para separar los hijos del panel (antes se apilaban
      // pegados). Seguro porque con keepMounted/hiddenUntilFound en false el
      // panel nunca renderiza con el atributo `hidden` (solo se desmonta):
      // ver useCollapsiblePanel (shouldRender vs hidden). Si algún día se
      // activa keepMounted, revisar: un display por clase anularía `hidden`.
      "grid gap-4 border-t border-border/60 px-4 pb-4 pt-3 outline-none",
      className
    )}
    {...props}
  />
))
AccordionPanel.displayName = "AccordionPanel"

export {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionPanel,
}
