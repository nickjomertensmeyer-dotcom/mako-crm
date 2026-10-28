export const modules = ['customers', 'leads', 'quotes', 'schedule', 'jobs', 'invoices', 'tasks', 'team'] as const;
export const industries = ['General business', 'Mobile detailing', 'Tree service', 'Cleaning', 'Consulting', 'Other'] as const;
export const presets: Record<string, readonly string[]> = {
  'General business': ['customers', 'leads', 'tasks', 'invoices'],
  'Mobile detailing': ['customers', 'quotes', 'schedule', 'jobs', 'invoices', 'tasks'],
  'Tree service': ['customers', 'leads', 'quotes', 'jobs', 'invoices', 'tasks', 'team'],
  Cleaning: ['customers', 'schedule', 'jobs', 'invoices', 'team'],
  Consulting: ['customers', 'leads', 'quotes', 'jobs', 'invoices', 'tasks'],
  Other: ['customers', 'tasks'],
};
