export const RENEWAL_GRACE_SECONDS = 7 * 24 * 60 * 60;

export type BillingInvoice = {
  id?: string; status: string; billing_reason?: string | null;
  created?: number; due_date?: number | null; amount_paid?: number; currency?: string;
  lines?: {data: {amount: number; period?: {start: number; end: number}; pricing?: {price_details?: {price: string}}}[]};
};

export function invoicePaidThrough(invoice: BillingInvoice | null, price: string) {
  if (invoice?.status !== 'paid') return 0;
  return Math.max(0, ...(invoice.lines?.data || []).filter(line => line.pricing?.price_details?.price === price && line.amount > 0).map(line => line.period?.end || 0));
}

// A retry never moves this deadline. An initial failed checkout is not a renewal.
export function renewalGraceEnd(invoice: BillingInvoice | null, previousPaidThrough: number, price: string) {
  if (!invoice || invoice.status !== 'open' || invoice.billing_reason !== 'subscription_cycle' || !previousPaidThrough) return 0;
  const starts = (invoice.lines?.data || []).filter(line => line.pricing?.price_details?.price === price && line.amount > 0).map(line => line.period?.start || 0).filter(Boolean);
  if (!starts.length) return 0;
  const start = Math.min(...starts);
  // Require a paid preceding period, not an old payment from an expired subscription.
  if (previousPaidThrough < start) return 0;
  return Math.max(start, invoice.due_date || 0) + RENEWAL_GRACE_SECONDS;
}

export function billingDate(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC'}).format(timestamp * 1000) + ' UTC';
}
