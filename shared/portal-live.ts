import { z } from "zod";
import { portalDisplay } from "./portal-display";

export const liveInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("click"),
    x: z.number().min(0).max(portalDisplay.maxWidth),
    y: z.number().min(0).max(portalDisplay.maxHeight),
  }),
  z.object({ type: z.literal("text"), value: z.string().max(2000) }),
  z.object({
    type: z.literal("key"),
    value: z.enum([
      "Tab",
      "Shift+Tab",
      "Enter",
      "Backspace",
      "Delete",
      "Escape",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "ControlOrMeta+A",
    ]),
  }),
  z.object({
    type: z.literal("scroll"),
    delta: z.number().min(-1200).max(1200),
    x: z.number().min(0).max(portalDisplay.maxWidth).optional(),
    y: z.number().min(0).max(portalDisplay.maxHeight).optional(),
  }),
  z.object({
    type: z.literal("resize"),
    width: z
      .number()
      .int()
      .min(portalDisplay.minWidth)
      .max(portalDisplay.maxWidth),
    height: z
      .number()
      .int()
      .min(portalDisplay.minHeight)
      .max(portalDisplay.maxHeight),
  }),
  z.object({ type: z.literal("refresh") }),
  z.object({ type: z.literal("login") }),
]);
export type LiveInput = z.infer<typeof liveInputSchema>;
export type LiveTicket = { url: string; token: string; expiresAt: number };
