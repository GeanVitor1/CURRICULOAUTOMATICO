export const plans = [
  { id: "free", name: "Gratuito", price: 0, dailyLimit: 5 },
  { id: "plus", name: "Essencial", price: 20, dailyLimit: 50 },
  { id: "pro", name: "Pro", price: 50, dailyLimit: 100 },
] as const;
export type PlanId = (typeof plans)[number]["id"];
export type BillingSummary = {
  paymentMode: "test" | "live" | "unconfigured";
  plan: PlanId;
  name: string;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  checkoutAvailable: boolean;
  portalAvailable: boolean;
};
