import { z } from "zod";

export const ISSUE_CATEGORIES = [
  "ospf_adjacency_failure",
  "vlan_trunk_misconfig",
  "acl_blocking_traffic",
  "mtu_mismatch",
  "duplex_speed_mismatch",
  "dhcp_pool_exhaustion",
] as const;

export const DiagnosisSchema = z.object({
  issue_category: z.enum(ISSUE_CATEGORIES),
  severity: z.enum(["low", "medium", "high", "critical"]),
  root_cause: z.string(),
  evidence: z.array(z.string()),
  suggested_fix: z.string(),
  confidence: z.number().min(0).max(1),
});

export type Diagnosis = z.infer<typeof DiagnosisSchema>;
