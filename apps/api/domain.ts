export const CATEGORIES = [
  "Royalty & Payments",
  "ISBN & Metadata Issues",
  "Printing & Quality",
  "Distribution & Availability",
  "Book Status & Production Updates",
  "General Inquiry",
] as const;

export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;

export const STATUSES = ["Open", "In Progress", "Resolved", "Closed"] as const;

export const PRIORITY_RANK: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};
